// src/capabilities/handlers.ts
// All handler implementations — provider method calls, utility functions, bridge, meta.

import { registry } from './registry'
import { getProvider } from '../providers/provider-registry'
import { idb } from '../idb'
import { LiveStorage } from '../LiveStorage'
import { syncManager } from '../sync-manager'

// ── Register all capability definitions FIRST (handlers depend on these) ──

import { ALL_CAPABILITY_DEFINITIONS } from './definitions'

for (const def of ALL_CAPABILITY_DEFINITIONS) {
  registry.register(def)
}

// ── Declare provider capabilities ──

// Gemini
for (const capId of [
  'conversation-list', 'message-fetch', 'search', 'create-conversation',
  'edit-title', 'delete-conversation', 'ping', 'get-chat-url',
  'fetch-all-gems', 'fetch-summary', 'auto-sync', 'is-offline',
  'detect-accounts', 'refresh-auth', 'is-authenticated', 'reset-rate-limit',
  'get-cached-accounts', 'ensure-authenticated',
]) {
  registry.declareProviderCapability('gemini', capId)
}

// OpenAI
for (const capId of [
  'conversation-list', 'message-fetch', 'search', 'create-conversation',
  'edit-title', 'delete-conversation', 'ping', 'get-chat-url',
  'detect-accounts', 'refresh-auth', 'is-authenticated', 'reset-rate-limit',
  'get-cached-accounts', 'ensure-authenticated',
]) {
  registry.declareProviderCapability('openai', capId)
}

// Claude
for (const capId of [
  'conversation-list', 'message-fetch', 'search', 'create-conversation',
  'edit-title', 'delete-conversation', 'ping', 'get-chat-url',
  'detect-accounts', 'refresh-auth', 'is-authenticated', 'reset-rate-limit',
  'get-cached-accounts', 'ensure-authenticated',
]) {
  registry.declareProviderCapability('claude', capId)
}

// ── Core handlers (delegate to provider methods) ──

registry.registerHandler('conversation-list', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
  return provider.listConversations(ctx.account!, ctx.params.cursor as string | undefined, ctx.params.limit as number | undefined)
})

registry.registerHandler('message-fetch', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
  return provider.getConversation(ctx.account!, ctx.params.conversationId as string)
})

registry.registerHandler('edit-title', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider?.editTitle) throw new Error('editTitle not supported')
  return provider.editTitle(ctx.account!, ctx.params.conversationId as string, ctx.params.title as string)
})

registry.registerHandler('delete-conversation', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider?.deleteConversation) throw new Error('deleteConversation not supported')
  return provider.deleteConversation(ctx.account!, ctx.params.conversationId as string)
})

registry.registerHandler('create-conversation', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider?.createConversation) throw new Error('createConversation not supported')
  return provider.createConversation(ctx.account!, ctx.params.prompt as string)
})

registry.registerHandler('search', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
  return provider.search(ctx.account!, ctx.params.query as string)
})

registry.registerHandler('ping', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
  return provider.ping(ctx.account!)
})

registry.registerHandler('get-chat-url', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
  const header = await idb.headers.get(ctx.params.conversationId as string)
  if (!header) throw new Error('Conversation not found')
  return provider.getChatUrl(header)
})

// ── Provider-specific handlers ──

registry.registerHandler('fetch-all-gems', async (ctx) => {
  const { fetchAllGems } = await import('../providers/gemini/index')
  return fetchAllGems(ctx.account!)
})

registry.registerHandler('fetch-summary', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider?.summarize) throw new Error('summarize not supported')
  return provider.summarize(ctx.account!, ctx.params.prompt as string, ctx.params.systemPrompt as string | undefined)
})

registry.registerHandler('is-offline', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  return (provider as any).isOffline(ctx.params.accountId as string)
})

// ── Utility handlers ──

registry.registerHandler('download-raw', async (ctx) => {
  const count = (ctx.params.count as number) || 1
  const specificConvId = ctx.params.conversationId as string | null

  let headers: any[] = []
  if (specificConvId) {
    const header = await idb.headers.get(specificConvId)
    if (header) {
      headers = [header]
    } else {
      headers = [{ id: specificConvId, accountId: ctx.account?.id, orgId: ctx.account?.id, title: 'Unknown', updated: Date.now() }]
    }
  } else {
    const allHeaders = await idb.headers
      .filter((h: any) => h.accountId === ctx.account?.id || h.accountId === '' || !h.accountId)
      .toArray()
    headers = allHeaders.sort((a: any, b: any) => (b.updated || 0) - (a.updated || 0)).slice(0, count)
  }

  if (headers.length === 0) throw new Error('No conversations found for this account')

  const { msgToIdb } = await import('../providers/gemini/parser')
  const { extractMediaFromMessages, extractMediaItemsFromRaw } = await import('../../sidepanel/lib/media-extract')

  const results = []
  for (const header of headers) {
    try {
      const { fetchProfile } = await import('../providers/gemini/auth')
      const { batchexecute } = await import('../providers/gemini/rpc')
      const profile = await fetchProfile(ctx.account!.index)
      let rawApiResponse: any = null
      let parsedMessages: any[] = []

      if (profile?.at) {
        try {
          rawApiResponse = await batchexecute(ctx.account!.index, profile.at, 'hNvQHb', [`c_${header.id}`, 100, null, 1, [1]], header.orgId || header.id)
          if (Array.isArray(rawApiResponse) && Array.isArray(rawApiResponse[0])) {
            parsedMessages = rawApiResponse[0]
              .map(msgToIdb)
              .filter((m: any): m is any[] => m !== null && Array.isArray(m))
              .flat()
            parsedMessages.sort((a: any, b: any) => a.timestamp - b.timestamp)
          }
        } catch (e: any) {
          rawApiResponse = { error: e.message }
        }
      }

      const media = [...new Set([
        ...extractMediaFromMessages(parsedMessages),
        ...extractMediaItemsFromRaw(parsedMessages),
      ].map((m: any) => m.url))].map((url: string) => ({ url }))

      results.push({ header, parsedMessages, rawApiResponse, media })
    } catch (e: any) {
      results.push({ header, error: e.message })
    }
  }

  return { count: results.length, requested: count, accountId: ctx.account?.id, accountEmail: ctx.account?.email, conversations: results }
})

registry.registerHandler('deobfuscate', async (ctx) => {
  // Reuses download-raw logic, caller adds taxonomy analysis
  const count = (ctx.params.count as number) || 1
  const specificConvId = ctx.params.conversationId as string | null

  let headers: any[] = []
  if (specificConvId) {
    const header = await idb.headers.get(specificConvId)
    if (header) {
      headers = [header]
    } else {
      headers = [{ id: specificConvId, accountId: ctx.account?.id, orgId: ctx.account?.id, title: 'Unknown', updated: Date.now() }]
    }
  } else {
    const allHeaders = await idb.headers
      .filter((h: any) => h.accountId === ctx.account?.id || h.accountId === '' || !h.accountId)
      .toArray()
    headers = allHeaders.sort((a: any, b: any) => (b.updated || 0) - (a.updated || 0)).slice(0, count)
  }

  if (headers.length === 0) throw new Error('No conversations found for this account')

  const { msgToIdb } = await import('../providers/gemini/parser')
  const { extractMediaFromMessages, extractMediaItemsFromRaw } = await import('../../sidepanel/lib/media-extract')

  const results = []
  for (const header of headers) {
    try {
      const { fetchProfile } = await import('../providers/gemini/auth')
      const { batchexecute } = await import('../providers/gemini/rpc')
      const profile = await fetchProfile(ctx.account!.index)
      let rawApiResponse: any = null
      let parsedMessages: any[] = []

      if (profile?.at) {
        try {
          rawApiResponse = await batchexecute(ctx.account!.index, profile.at, 'hNvQHb', [`c_${header.id}`, 100, null, 1, [1]], header.orgId || header.id)
          if (Array.isArray(rawApiResponse) && Array.isArray(rawApiResponse[0])) {
            parsedMessages = rawApiResponse[0]
              .map(msgToIdb)
              .filter((m: any): m is any[] => m !== null && Array.isArray(m))
              .flat()
            parsedMessages.sort((a: any, b: any) => a.timestamp - b.timestamp)
          }
        } catch (e: any) {
          rawApiResponse = { error: e.message }
        }
      }

      const media = [...new Set([
        ...extractMediaFromMessages(parsedMessages),
        ...extractMediaItemsFromRaw(parsedMessages),
      ].map((m: any) => m.url))].map((url: string) => ({ url }))

      results.push({ header, parsedMessages, rawApiResponse, media })
    } catch (e: any) {
      results.push({ header, error: e.message })
    }
  }

  return { count: results.length, requested: count, accountId: ctx.account?.id, accountEmail: ctx.account?.email, conversations: results }
})

registry.registerHandler('download-media', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  const conversation = await provider!.getConversation(ctx.account!, ctx.params.conversationId as string)
  if (!conversation) throw new Error('Conversation not found')
  const { extractMediaFromMessages, extractMediaItemsFromRaw } = await import('../../sidepanel/lib/media-extract')
  const messages = conversation.messages || []
  const mediaFromMessages = extractMediaFromMessages(messages)
  const mediaFromRaw = extractMediaItemsFromRaw(messages as any[])
  const allMedia = [...mediaFromMessages, ...mediaFromRaw]
  const seen = new Set<string>()
  const uniqueMedia = allMedia.filter((m: any) => {
    if (seen.has(m.url)) return false
    seen.add(m.url)
    return true
  })
  return { conversationId: conversation.id, media: uniqueMedia }
})

registry.registerHandler('sync-missing', async (ctx) => {
  const { syncMissingFromSearch } = await import('../providers/gemini/index')
  return syncMissingFromSearch(ctx.params.searchResults as any[], ctx.account!)
})

registry.registerHandler('get-all-headers', async (ctx) => {
  const serviceId = ctx.params.serviceId as string
  const accountId = ctx.params.accountId as string | undefined
  return idb.headers
    .filter((h: any) => {
      if (h.serviceId !== serviceId) return false
      if (accountId) return h.accountId === accountId || h.accountId === '' || !h.accountId
      return true
    })
    .reverse()
    .toArray()
})

registry.registerHandler('fetch-media-base64', async (ctx) => {
  const urls: string[] = ctx.params.urls as string[]
  const results: Array<{ url: string; dataUrl?: string; error?: string; ext?: string }> = []
  for (const url of urls) {
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const arrayBuffer = await resp.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      const binary = bytes.reduce((acc, b) => acc + String.fromCharCode(b), '')
      const base64 = btoa(binary)
      const contentType = resp.headers.get('content-type') || 'image/png'
      const ext = contentType.split('/')[1]?.split(';')[0] || 'png'
      const dataUrl = `data:${contentType};base64,${base64}`
      results.push({ url, dataUrl, ext })
    } catch (e: any) {
      results.push({ url, error: e.message })
    }
  }
  return results
})

registry.registerHandler('get-rate-limit-status', async () => {
  const state = await idb.services.get('gemini')
  return { isRateLimited: state?.isRateLimited || false, serviceId: 'gemini' }
})

registry.registerHandler('get-cached-accounts', async (ctx) => {
  const serviceId = (ctx.params.serviceId as string) || ctx.providerId
  const accounts = await idb.accounts.filter((a: any) => a.serviceId === serviceId).toArray()
  const enriched = await Promise.all(accounts.map(async (acc: any) => ({
    ...acc,
    conversationCount: await idb.headers.filter((h: any) => h.accountId === acc.id).count(),
  })))
  return enriched
})

// Shared utility: check if any cookie exists across domains
async function checkAnyCookie(domains: string[], cookieNames: string[]): Promise<boolean> {
  for (const domain of domains) {
    for (const name of cookieNames) {
      const cookie = await new Promise<chrome.cookies.Cookie | null>(resolve =>
        chrome.cookies.get({ url: domain, name }, resolve)
      )
      if (cookie?.value) return true
    }
  }
  return false
}

// Provider-specific auth cookie names (include Google multi-account variants)
const PROVIDER_COOKIE_MAP: Record<string, string[]> = {
  gemini: ['SID', '__Secure-1PSID', '__Secure-3PSID'],
  openai: ['__Secure-next-auth.session-token', 'access_token'],
  claude: ['sessionKey', 'anthropic-api-key'],
}

registry.registerHandler('ensure-authenticated', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)

  // Step 1: Return cached accounts if available
  const cached = await idb.accounts.filter((a: any) => a.serviceId === provider.id).toArray()
  if (cached.length > 0) return cached

  // Step 2: Gate on browser cookies before any network call (provider-aware)
  const cookieDomains = provider.config.origins?.map(o => o.replace('/*', '')) ?? []
  const cookieNames = PROVIDER_COOKIE_MAP[provider.id] || ['SID']
  const hasCookie = await checkAnyCookie(cookieDomains, cookieNames)
  if (!hasCookie) return []

  // Step 3: Only now call provider.detectAccounts()
  const accounts = await provider.detectAccounts()

  // Step 4: Persist any new accounts and enrich with metadata
  const enriched: any[] = []
  for (const acc of accounts) {
    await idb.accounts.put(acc)
    const existingOrg = await idb.orgs.get(acc.id)
    if (!existingOrg) {
      await idb.orgs.put({
        serviceId: acc.serviceId,
        accountId: acc.id,
        email: acc.email || '',
        name: acc.name || acc.email || '',
        id: acc.id,
        status: 0, // OrgStatus.New
      })
    }
    const conversationCount = await idb.headers.filter((h: any) => h.accountId === acc.id).count()
    enriched.push({
      ...acc,
      conversationCount,
      lastSync: null,
    })
  }

  return enriched
})

registry.registerHandler('detect-accounts', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)

  try {
    // Use ensure-authenticated for cache-first, cookie-gated resolution
    const accounts = await Promise.race([
      engine.execute({ providerId: ctx.providerId, capabilityId: 'ensure-authenticated' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('detectAccounts timeout')), 30000)),
    ]) as any[]

    const enriched = await Promise.all(accounts.map(async (acc: any) => {
      const count = await idb.headers.filter((h: any) => h.accountId === acc.id).count()
      return {
        id: acc.id,
        serviceId: acc.serviceId,
        index: acc.index,
        email: acc.email || '',
        name: acc.name || '',
        conversationCount: count,
        lastSync: null,
      }
    }))
    return enriched
  } catch (e: any) {
    if (e.message === 'detectAccounts timeout') return []
    throw e
  }
})

registry.registerHandler('get-network-logs', async () => {
  return []
})

// ── Meta handlers ──

async function getProviderState(): Promise<any> {
  const { getAllProviders } = await import('../providers/provider-registry')
  const providers = getAllProviders()
  const state: any[] = []
  for (const provider of providers) {
    const accounts = await idb.accounts.filter((a: any) => a.serviceId === provider.id).toArray()
    const connected = accounts.length > 0
    const conversationCount = connected
      ? await idb.headers.filter((h: any) => h.serviceId === provider.id).count()
      : 0
    state.push({
      id: provider.id,
      name: provider.name,
      connected,
      conversationCount,
      accountCount: accounts.length,
      accounts: accounts.map((a: any) => ({ id: a.id, email: a.email || '', name: a.name || '' })),
      lastSync: null,
      isSyncing: false,
      isRateLimited: false,
    })
  }
  return state
}

registry.registerHandler('get-state', async () => {
  return getProviderState()
})

registry.registerHandler('sync-provider', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (provider) {
    // FIX: Use engine's cache-first account resolution instead of direct detectAccounts()
    const accounts = await engine.execute({ providerId: ctx.providerId, capabilityId: 'ensure-authenticated' }) as any[]
    const targetAccount = ctx.accountId
      ? accounts.find((a: any) => a.id === ctx.accountId)
      : accounts[0]
    if (targetAccount) {
      syncManager.syncProvider(provider, targetAccount)
    }
  }
  return { ok: true }
})

registry.registerHandler('sync-conversation', async (ctx) => {
  const provider = getProvider(ctx.providerId)
  if (provider) {
    // FIX: Use engine's cache-first account resolution instead of direct detectAccounts()
    const accounts = await engine.execute({ providerId: ctx.providerId, capabilityId: 'ensure-authenticated' }) as any[]
    const targetAccount = ctx.accountId
      ? accounts.find((a: any) => a.id === ctx.accountId)
      : accounts[0]
    if (targetAccount) {
      syncManager.syncConversation(provider, targetAccount, ctx.params.conversationId as string)
    }
  }
  return { ok: true }
})

registry.registerHandler('set-active-account', async (ctx) => {
  await LiveStorage.set('settings.accounts.activeId', (ctx.params.accountId as string) || '')
  return { ok: true }
})

registry.registerHandler('get-active-account', async () => {
  return LiveStorage.get({ 'settings.accounts.activeId': '' })
})

registry.registerHandler('get-settings', async () => {
  return LiveStorage.get({
    'settings.general.manualSync': LiveStorage.defaultValue,
    'settings.rateLimit.minGapMs': 1000,
    'settings.rateLimit.autoResetMs': 300000,
  })
})

registry.registerHandler('set-settings', async (ctx) => {
  const promises = Object.entries(ctx.params.settings as Record<string, unknown>).map(([key, value]) =>
    LiveStorage.set(key, value)
  )
  await Promise.all(promises)
  return { ok: true }
})

registry.registerHandler('reset-rate-limit', async () => {
  await idb.services.update('gemini', { isRateLimited: false })
  const { clearProfileCache } = await import('../providers/gemini/auth')
  clearProfileCache()
  return { ok: true }
})

registry.registerHandler('chat-adjust-body', async (ctx) => {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*', active: true })
  if (tabs.length === 0) throw new Error('No active Gemini tab found')
  await chrome.tabs.sendMessage(tabs[0].id!, {
    type: 'chat-adjust-body',
    isOpen: ctx.params.isOpen as boolean,
    isTransitioning: (ctx.params.isTransitioning as boolean) || false,
    appWidth: (ctx.params.appWidth as number) || 440,
  })
})

registry.registerHandler('chat-handle-submission', async (ctx) => {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*', active: true })
  if (tabs.length === 0) throw new Error('No active Gemini tab found')
  await chrome.tabs.sendMessage(tabs[0].id!, {
    type: 'chat-handle-submission',
    promptData: ctx.params.promptData as Record<string, unknown> | undefined,
  })
})

registry.registerHandler('chat-inject-continue-btn', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*', active: true })
  if (tabs.length === 0) throw new Error('No active Gemini tab found')
  await chrome.tabs.sendMessage(tabs[0].id!, { type: 'chat-inject-continue-btn' })
})

registry.registerHandler('chat-capture-network-id', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*', active: true })
  if (tabs.length === 0) throw new Error('No active Gemini tab found')
  return chrome.tabs.sendMessage(tabs[0].id!, { type: 'chat-capture-network-id' })
})

registry.registerHandler('chat-cleanup-prompts', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*', active: true })
  if (tabs.length === 0) throw new Error('No active Gemini tab found')
  return chrome.tabs.sendMessage(tabs[0].id!, { type: 'chat-cleanup-prompts' })
})

registry.registerHandler('chat-read-model', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*', active: true })
  if (tabs.length === 0) throw new Error('No active Gemini tab found')
  return chrome.tabs.sendMessage(tabs[0].id!, { type: 'chat-read-model' })
})

registry.registerHandler('chat-set-app-width', async (ctx) => {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*', active: true })
  if (tabs.length === 0) throw new Error('No active Gemini tab found')
  await chrome.tabs.sendMessage(tabs[0].id!, {
    type: 'chat-set-app-width',
    width: ctx.params.width as number,
    dragger: ctx.params.dragger as string | undefined,
  })
})
