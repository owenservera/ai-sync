import { registerProvider, getProvider } from '../src/providers/provider-registry'
import { GeminiProvider } from '../src/providers/gemini/index'
import { OpenAIProvider } from '../src/providers/openai/index'
import { ClaudeProvider } from '../src/providers/claude/index'
import { syncManager } from '../src/sync-manager'
import { idb } from '../src/idb'
import { LiveStorage } from '../src/LiveStorage'
import { log, logError } from '../src/log'
import { type Account, type Org, type RequestDetails } from '../src/types'
import { engine } from '../src/capabilities/engine'
import '../src/capabilities/handlers'

// ── Initialize providers ──

const gemini = new GeminiProvider()
const openai = new OpenAIProvider()
const claude = new ClaudeProvider()

registerProvider(gemini)
registerProvider(openai)
registerProvider(claude)

// ── Extension lifecycle ──

chrome.runtime.onInstalled.addListener(async () => {
  log('SW', 'Extension installed')
  await gemini.init()
  await openai.init()
  await claude.init()
})

// ── Side panel behavior ──

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(e => logError('SW', `Side panel behavior error: ${e}`))

// ── Handle network requests (auto-sync for supported providers) ──

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
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
      const trigger = await gemini.handleNetworkActivity(requestDetails)
      if (trigger) {
        // FIX: Use cached accounts from IDB instead of expensive re-scan on every trigger
        const accounts = await idb.accounts.filter((a: any) => a.serviceId === 'gemini' && a.token).toArray()
        for (const account of accounts) {
          syncManager.syncProvider(gemini, account)
        }
      }
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
    await syncManager.syncAll()
  }
})

// ── Message routing via capability engine ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPABILITY_EXECUTE') {
    engine.execute(message).then(sendResponse).catch(e => sendResponse({ error: e.message }))
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
    engine.execute({
      ...message,
      capabilityId,
      providerId: message.providerId || message.serviceId,
    }).then(sendResponse).catch(e => sendResponse({ error: e.message }))
    return true
  }
})

log('SW', 'Service worker loaded')
