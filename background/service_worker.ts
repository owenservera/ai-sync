import { registerProvider, getProvider } from '../src/providers/provider-registry'
import { GeminiProvider } from '../src/providers/gemini/index'
import { OpenAIProvider } from '../src/providers/openai/index'
import { ClaudeProvider } from '../src/providers/claude/index'
import { syncManager } from '../src/sync-manager'
import { idb } from '../src/idb'
import { LiveStorage } from '../src/LiveStorage'
import { log, logError } from '../src/log'
import { type Account, type Org, type RequestDetails } from '../src/types'

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
        const accounts = await gemini.detectAccounts()
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

// ── Message relay (sidepanel ↔ background) ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATE': {
      getProviderState().then(sendResponse)
      return true
    }
    case 'SYNC_PROVIDER': {
      const provider = getProvider(message.providerId)
      if (provider) {
        provider.detectAccounts().then(accounts => {
          const targetAccount = message.accountId
            ? accounts.find(a => a.id === message.accountId)
            : accounts[0]
          if (targetAccount) {
            syncManager.syncProvider(provider, targetAccount)
          }
        })
      }
      sendResponse({ ok: true })
      return false
    }
    case 'SYNC_CONVERSATION': {
      const provider = getProvider(message.providerId)
      if (provider) {
        provider.detectAccounts().then(accounts => {
          const targetAccount = message.accountId
            ? accounts.find(a => a.id === message.accountId)
            : accounts[0]
          if (targetAccount) {
            syncManager.syncConversation(provider, targetAccount, message.conversationId)
          }
        })
      }
      sendResponse({ ok: true })
      return false
    }
    case 'DELETE_CONVERSATION': {
      const provider = getProvider(message.providerId)
      if (provider?.deleteConversation) {
        provider.detectAccounts().then(accounts => {
          const account = accounts[0]
          if (account) {
            provider.deleteConversation!(account, message.conversationId)
          }
        })
      }
      sendResponse({ ok: true })
      return false
    }
    case 'EDIT_TITLE': {
      const provider = getProvider(message.providerId)
      if (provider?.editTitle) {
        provider.detectAccounts().then(accounts => {
          const account = accounts[0]
          if (account) {
            provider.editTitle!(account, message.conversationId, message.title)
          }
        })
      }
      sendResponse({ ok: true })
      return false
    }
    case 'GET_ACCOUNTS': {
      const serviceId = message.serviceId || 'gemini'
      const provider = getProvider(serviceId)
      if (!provider) { sendResponse([]); return false }
      provider.detectAccounts().then(async (accounts) => {
        const result = []
        for (const acc of accounts) {
          const convCount = await idb.headers.filter(h => h.accountId === acc.id || h.accountId === '' || !h.accountId).count()
          const lastHeader = await idb.headers.filter(h => h.accountId === acc.id || h.accountId === '' || !h.accountId).reverse().first()
          result.push({
            ...acc,
            conversationCount: convCount,
            lastSync: lastHeader?.updated || null,
          })
        }
        sendResponse(result)
      }).catch(() => sendResponse([]))
      return true
    }
    case 'SET_ACTIVE_ACCOUNT': {
      LiveStorage.set('settings.accounts.activeId', message.accountId || '').then(() => sendResponse({ ok: true }))
      return true
    }
    case 'GET_ACTIVE_ACCOUNT': {
      LiveStorage.get({ 'settings.accounts.activeId': '' }).then(sendResponse)
      return true
    }
    case 'GET_ALL_HEADERS': {
      const serviceId = message.serviceId || 'gemini'
      const accountId = message.accountId
      idb.headers
        .filter((h: any) => {
          if (h.serviceId !== serviceId) return false
          if (accountId) return h.accountId === accountId || h.accountId === '' || !h.accountId
          return true
        })
        .reverse()
        .toArray()
        .then(sendResponse)
      return true
    }
    case 'GET_SETTINGS': {
      LiveStorage.get({
        'settings.general.manualSync': false,
        'settings.sync.mode': 'auto-sync',
        'settings.sync.lastN': 50,
        'settings.summary.orgId': '',
        'settings.pagination.batchSize': 100,
        'settings.pagination.maxLimit': 500,
        'settings.pagination.maxPages': 50,
        'settings.rateLimit.windowMs': 10000,
        'settings.rateLimit.maxRequests': 5,
        'settings.rateLimit.minGapMs': 1000,
        'settings.rateLimit.autoResetMs': 300000,
      }).then(sendResponse)
      return true
    }
    case 'SET_SETTINGS': {
      const promises = Object.entries(message.settings).map(([key, value]) =>
        LiveStorage.set(key, value)
      )
      Promise.all(promises).then(() => sendResponse({ ok: true }))
      return true
    }
    case 'TEST_LIST_CONVERSATIONS':
    case 'TEST_FETCH_CONTENT':
    case 'TEST_EDIT_TITLE':
    case 'TEST_DELETE_CONVERSATION':
    case 'TEST_CREATE_CONVERSATION':
    case 'TEST_FETCH_SUMMARY':
    case 'TEST_FETCH_ALL_GEMS':
    case 'TEST_SEARCH':
    case 'TEST_SYNC_MISSING':
    case 'TEST_PING':
    case 'TEST_IS_OFFLINE':
    case 'TEST_GET_CHAT_URL':
    case 'TEST_DOWNLOAD_MEDIA':
    case 'TEST_DOWNLOAD_RAW':
    case 'GET_RATE_LIMIT_STATUS': {
      handleCapabilityTest(message).then(sendResponse).catch(e => sendResponse({ error: e.message }))
      return true
    }
  }
})

async function handleCapabilityTest(message: any): Promise<any> {
  const provider = getProvider(message.providerId || 'gemini')
  if (!provider) throw new Error(`Provider not found: ${message.providerId}`)

  const accounts = await provider.detectAccounts()
  let account: any = accounts[0]

  if (message.accountId) {
    const found = accounts.find(a => a.id === message.accountId)
    if (found) account = found
  }
  if (!account) throw new Error('No authenticated account found')

  switch (message.type) {
    case 'TEST_LIST_CONVERSATIONS':
      return provider.listConversations(account, message.cursor, message.limit)
    case 'TEST_FETCH_CONTENT':
      return provider.getConversation(account, message.conversationId)
    case 'TEST_EDIT_TITLE':
      if (!provider.editTitle) throw new Error('editTitle not supported')
      return provider.editTitle(account, message.conversationId, message.title)
    case 'TEST_DELETE_CONVERSATION':
      if (!provider.deleteConversation) throw new Error('deleteConversation not supported')
      return provider.deleteConversation(account, message.conversationId)
    case 'TEST_CREATE_CONVERSATION':
      if (!provider.createConversation) throw new Error('createConversation not supported')
      return provider.createConversation(account, message.prompt)
    case 'TEST_FETCH_SUMMARY':
      if (!provider.summarize) throw new Error('summarize not supported')
      return provider.summarize(account, message.prompt, message.systemPrompt)
    case 'TEST_FETCH_ALL_GEMS': {
      const { fetchAllGems } = await import('../src/providers/gemini/index')
      return fetchAllGems(account)
    }
    case 'TEST_SEARCH':
      return provider.search(account, message.query)
    case 'TEST_SYNC_MISSING': {
      const { syncMissingFromSearch } = await import('../src/providers/gemini/index')
      return syncMissingFromSearch(message.searchResults, account)
    }
    case 'TEST_PING':
      return provider.ping(account)
    case 'TEST_IS_OFFLINE':
      return (provider as any).isOffline(message.accountId)
    case 'TEST_GET_CHAT_URL': {
      const header = await idb.headers.get(message.conversationId)
      if (!header) throw new Error('Conversation not found')
      return provider.getChatUrl(header)
    }
    case 'GET_RATE_LIMIT_STATUS': {
      const state = await idb.services.get('gemini')
      return { isRateLimited: state?.isRateLimited || false, serviceId: 'gemini' }
    }
    case 'TEST_DOWNLOAD_RAW': {
      const count = message.count || 1

      const allHeaders = await idb.headers
        .filter((h: any) => h.accountId === account.id || h.accountId === '' || !h.accountId)
        .toArray()
      const headers = allHeaders.sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, count)

      if (headers.length === 0) throw new Error('No conversations found for this account')

      const { msgToIdb } = await import('../src/providers/gemini/parser')
      const { extractMediaFromMessages, extractMediaItemsFromRaw } = await import('../sidepanel/lib/media-extract')

      const results = []
      for (const header of headers) {
        try {
          const { fetchProfile } = await import('../src/providers/gemini/auth')
          const { batchexecute } = await import('../src/providers/gemini/rpc')
          const profile = await fetchProfile(account.index)
          let rawApiResponse = null
          let parsedMessages = []

          if (profile?.at) {
            try {
              rawApiResponse = await batchexecute(account.index, profile.at, 'hNvQHb', [`c_${header.id}`, 100, null, 1, [1]], header.orgId || header.id)

              if (Array.isArray(rawApiResponse) && Array.isArray(rawApiResponse[0])) {
                parsedMessages = rawApiResponse[0]
                  .map(msgToIdb)
                  .filter((m): m is any => m !== null && Array.isArray(m))
                  .flat()
                parsedMessages.sort((a: any, b: any) => a.timestamp - b.timestamp)
              }
            } catch (e) {
              rawApiResponse = { error: (e as Error).message }
            }
          }

          const media = [...new Set([
            ...extractMediaFromMessages(parsedMessages),
            ...extractMediaItemsFromRaw(parsedMessages as any[]),
          ].map(m => m.url))].map(url => ({ url }))

          results.push({
            header,
            parsedMessages,
            rawApiResponse,
            media,
          })
        } catch (e) {
          results.push({ header, error: (e as Error).message })
        }
      }

      return { count: results.length, requested: count, accountId: account.id, accountEmail: account.email, conversations: results }
    }
    case 'TEST_DOWNLOAD_MEDIA': {
      const conversation = await provider.getConversation(account, message.conversationId)
      if (!conversation) throw new Error('Conversation not found')

      const { extractMediaFromMessages, extractMediaItemsFromRaw } = await import('../sidepanel/lib/media-extract')

      const messages = conversation.messages || []
      const mediaFromMessages = extractMediaFromMessages(messages)
      const mediaFromRaw = extractMediaItemsFromRaw(messages as any[])

      const allMedia = [...mediaFromMessages, ...mediaFromRaw]
      const seen = new Set<string>()
      const uniqueMedia = allMedia.filter(m => {
        if (seen.has(m.url)) return false
        seen.add(m.url)
        return true
      })

      return { conversationId: conversation.id, media: uniqueMedia }
    }
    default:
      throw new Error(`Unknown capability test: ${message.type}`)
  }
}

async function getProviderState(): Promise<any> {
  const providers = [gemini, openai, claude]
  const state: any[] = []

  for (const provider of providers) {
    const accounts = await provider.detectAccounts()
    const connected = accounts.length > 0
    const conversationCount = connected
      ? await idb.headers.filter(h => h.serviceId === provider.id).count()
      : 0

    state.push({
      id: provider.id,
      name: provider.name,
      connected,
      conversationCount,
      accountCount: accounts.length,
      accounts: accounts.map(a => ({ id: a.id, email: a.email || '', name: a.name || '' })),
      lastSync: null,
      isSyncing: false,
      isRateLimited: false,
    })
  }

  return state
}

log('SW', 'Service worker loaded')
