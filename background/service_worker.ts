import { registerProvider, getProvider } from '../src/providers/provider-registry'
import { GeminiProvider } from '../src/providers/gemini/index'
import { OpenAIProvider } from '../src/providers/openai/index'
import { ClaudeProvider } from '../src/providers/claude/index'
import { syncOrchestrator } from '../src/sync/SyncOrchestrator'
import { backgroundTabRegistry } from '../src/content/tab-registry'
import { accountManager } from '../src/accounts/AccountManager'
import { idb } from '../src/idb'
import { LiveStorage } from '../src/LiveStorage'
import { log, logWarn, logError, setDebugMode } from '../src/log'
import { type Account, type Org, type RequestDetails } from '../src/types'
import { engine } from '../src/capabilities/engine'
import '../src/capabilities/handlers'

// EARLY DEBUG: confirm service worker is starting
log('SW', '=== Service worker starting ===')

// Initialize sync orchestrator on SW startup
syncOrchestrator.init().catch(err => {
  logError('SW', 'SyncOrchestrator init failed', err)
})

// Initialize background tab registry for bridge capability resolution
backgroundTabRegistry.init()

// Check debug mode from settings on SW startup
chrome.storage.local.get('settings.general.debug', (data) => {
  setDebugMode(data['settings.general.debug'] ?? false)
  log('SW', `Debug mode: ${data['settings.general.debug'] ?? false}`)
})

// ── Initialize providers ──

const gemini = new GeminiProvider()
const openai = new OpenAIProvider()
const claude = new ClaudeProvider()

registerProvider(gemini)
registerProvider(openai)
registerProvider(claude)

// ── Initialize account detection on SW startup ──

accountManager.initializeAccounts().catch(err => {
  logError('SW', 'Account initialization failed', err)
})

// ── Extension lifecycle ──

chrome.runtime.onInstalled.addListener(async () => {
  log('SW', 'Extension installed')
  await gemini.init()
  await openai.init()
  await claude.init()
})

// ── Side panel behavior ──

try {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(e => logError('SW', `Side panel behavior error: ${e}`))
} catch (e) {
  logError('SW', `Side panel init error (likely Chrome version): ${e}`)
}

// ── Handle network requests (auto-sync for supported providers) ──

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // SECURITY: Skip extension-originated requests (our own fetch calls) — fix H8
    if (details.tabId === -1 || details.initiator === chrome.runtime.id) return

    const url = details.url || ''
    const requestBody = details.requestBody?.raw?.[0]?.bytes
      ? new TextDecoder().decode(details.requestBody.raw[0].bytes)
      : ''

    const requestDetails: RequestDetails = {
      url,
      request: {
        method: details.method,
        body: requestBody,
      },
    }

    // Route to Gemini network handler
    if (url.includes('gemini.google.com')) {
      gemini.handleNetworkActivity(requestDetails).then(trigger => {
        if (trigger) {
          // FIX: Use accountManager for cached account access — fix C4
          accountManager.listAccounts('gemini').then(accounts => {
            for (const account of accounts) {
              syncOrchestrator.syncProvider(gemini, account).catch(err => {
                logError('SW', `Auto-sync failed for ${account.id}`, err)
              })
            }
          }).catch(err => {
            logError('SW', 'Failed to list accounts for auto-sync', err)
          })
        }
      }).catch(err => {
        logError('SW', 'Network activity handler failed', err)
      })
    }
  },
  {
    urls: [
      'https://gemini.google.com/*',
      'https://chatgpt.com/*',
      'https://claude.ai/*',
    ],
  },
  ['requestBody'],
)

// ── Periodic sync alarm ──

chrome.alarms.create('periodic-sync', { periodInMinutes: 15 })
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic-sync') {
    log('SW', 'Periodic sync triggered')
    await syncOrchestrator.syncAll()
  }
})

// ── Message routing via capability engine ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // SECURITY: Reject messages from external sources (fix C1)
  if (sender.id !== chrome.runtime.id) {
    logError('SW', `Unauthorized message sender: ${sender.id}`)
    sendResponse({ error: 'Unauthorized sender' })
    return false
  }

  log('SW', `onMessage received: ${message.type}`)

  if (message.type === 'CAPABILITY_EXECUTE') {
    log('SW', `routing CAPABILITY_EXECUTE: ${message.capabilityId}`)
    // FIX H4: Extract known fields only — no legacy spread
    engine.execute({
      providerId: message.providerId ?? message.serviceId,
      capabilityId: message.capabilityId,
      accountId: message.accountId,
      params: message.params ?? {},
    }).then(result => {
      log('SW', `CAPABILITY_EXECUTE success: ${message.capabilityId}`)
      sendResponse(result)
    }).catch(e => {
      logError('SW', `CAPABILITY_EXECUTE error: ${message.capabilityId}`, e)
      sendResponse({ error: e.message })
    })
    return true
  }

  const legacyMap: Record<string, string> = {
    'TEST_LIST_CONVERSATIONS': 'conversation-list',
    'TEST_FETCH_CONTENT': 'message-fetch',
    'TEST_EDIT_TITLE': 'edit-title',
    'EDIT_TITLE': 'edit-title',
    'TEST_DELETE_CONVERSATION': 'delete-conversation',
    'DELETE_CONVERSATION': 'delete-conversation',
    'TEST_CREATE_CONVERSATION': 'create-conversation',
    'TEST_SEARCH': 'search',
    'TEST_PING': 'ping',
    'TEST_GET_CHAT_URL': 'get-chat-url',
    'TEST_FETCH_SUMMARY': 'fetch-summary',
    'TEST_FETCH_ALL_GEMS': 'fetch-all-gems',
    'TEST_IS_OFFLINE': 'is-offline',
    'GET_ACCOUNTS': 'detect-accounts',
    'TEST_SYNC_MISSING': 'sync-missing',
    'TEST_DOWNLOAD_RAW': 'download-raw',
    'TEST_DEOBFUSCATE': 'deobfuscate',
    'TEST_DOWNLOAD_MEDIA': 'download-media',
    'GET_ALL_HEADERS': 'get-all-headers',
    'FETCH_MEDIA_AS_BASE64': 'fetch-media-base64',
    'GET_RATE_LIMIT_STATUS': 'get-rate-limit-status',
    'GET_NETWORK_LOGS': 'get-network-logs',
    'RESET_RATE_LIMIT': 'reset-rate-limit',
    'GET_STATE': 'get-state',
    'SYNC_PROVIDER': 'sync-provider',
    'SYNC_CONVERSATION': 'sync-conversation',
    'SET_ACTIVE_ACCOUNT': 'set-active-account',
    'GET_ACTIVE_ACCOUNT': 'get-active-account',
    'GET_SETTINGS': 'get-settings',
    'SET_SETTINGS': 'set-settings',
  }

  const capabilityId = legacyMap[message.type]
  if (capabilityId) {
    const providerId = message.providerId || message.serviceId
    log('SW', `legacy message mapped: ${message.type} -> ${capabilityId}`)
    // FIX H4: Extract known fields only — no legacy spread
    engine.execute({
      providerId: providerId,
      capabilityId,
      accountId: message.accountId,
      params: {},
    }).then(result => {
      log('SW', `legacy engine.execute success: ${message.type}`)
      sendResponse(result)
    }).catch(e => {
      logError('SW', `legacy engine.execute error: ${message.type}`, e)
      sendResponse({ error: e.message })
    })
    return true
  }

  logWarn('SW', `unhandled message type: ${message.type}`)
})

log('SW', 'Service worker loaded')
