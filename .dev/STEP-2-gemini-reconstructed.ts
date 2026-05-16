// ============================================================================
// gemini.ts - COMPLETE RECONSTRUCTION from original minified bundle
// Source: static/background/index.js module key "4tthb" (lines 4602-4605)
// All functions deobfuscated and typed. Preserves original logic faithfully.
// ============================================================================

import { idb } from '../idb'
import { log, logInfo, logWarn, logError, emitRateLimitEvent } from '../log'
import { LiveStorage } from '../LiveStorage'
import { delay, fetchServiceApi, makeSumarizationFunction, captureException } from '../common'
import { ServiceDefinition, Conversation, Message, Account, Org, Header } from '../types'

// ---- Constants ----

const SERVICE_ID = 'gemini'
const GEMINI_DOMAIN = 'gemini.google.com'
const GEMINI_ORIGIN = 'https://gemini.google.com'
const STREAM_GENERATE_URL = `${GEMINI_ORIGIN}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`

// ---- In-memory caches ----
const profileCache = new Map<number, { token: string; timestamp: number; id: string | null; email?: string; name?: string }>()
const syncThrottleCache = new Map<string, number>() // orgId -> last sync timestamp
const rateLimitNotificationCache = new Map<string, number>() // serviceId -> last notification timestamp

// ---- External module reference (for rate limit notification) ----
const _4817fb4f945644cf: any = null // dynamic import for notification module

// ============================================================================
// 1. Rate Limiter
// ============================================================================

class RateLimiter {
  private lastRequestTime = 0
  private requestTimestamps: number[] = []

  async throttle(): Promise<void> {
    const now = Date.now()
    
    // Clean up timestamps older than 10s
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 10000)
    
    // Max 5 requests in 10s window
    if (this.requestTimestamps.length >= 5) {
      const oldest = this.requestTimestamps[0]
      const waitTime = 10000 - (now - oldest)
      if (waitTime > 0) {
        await delay(waitTime)
      }
    }
    
    // Min 1s between requests
    const timeSinceLast = now - this.lastRequestTime
    if (timeSinceLast < 1000) {
      await delay(1000 - timeSinceLast)
    }
    
    this.lastRequestTime = Date.now()
    this.requestTimestamps.push(this.lastRequestTime)
  }

  reset(): void {
    this.lastRequestTime = 0
    this.requestTimestamps = []
  }
}

const rateLimiter = new RateLimiter()

// ============================================================================
// 2. Service Definition (exported as "gemini")
// ============================================================================

export const geminiService: ServiceDefinition = {
  domain: GEMINI_DOMAIN,
  id: SERVICE_ID,
  name: 'Gemini',
  untiteled: '',
  maxLimit: 500,

  // ---- Chat URL ----
  async getChatUrl(conversationId: string): Promise<string> {
    try {
      if (!conversationId) {
        throw new Error('gemini.ts:getChatUrl - Invalid conversation id')
      }
      
      const header = await idb.headers.get(conversationId)
      if (!header) {
        throw new Error(`gemini.ts:getChatUrl - Header not found: ${conversationId}`)
      }
      if (!header.accountId) {
        throw new Error(`gemini.ts:getChatUrl - Header missing accountId: ${conversationId}`)
      }
      
      const account = await idb.accounts.get(header.accountId)
      const userPrefix = account?.index ? `/u/${account.index}` : ''
      
      if (header.gemId) {
        return `https://${GEMINI_DOMAIN}${userPrefix}/gem/${header.gemId}/${conversationId}`
      }
      return `https://${GEMINI_DOMAIN}${userPrefix}/app/${conversationId}`
    } catch (error) {
      logError('gemini.ts:getChatUrl', `Failed to get chat URL | error: ${JSON.stringify(error?.message || error)}`)
      throw error
    }
  },

  // ---- Network hooks ----
  onFetch,
  onGoogleAccountFetch,

  // ---- Offline check ----
  async isOffline(accountId: string): Promise<boolean> {
    try {
      const account = await idb.accounts.get(accountId)
      if (!account) return true
      
      const profile = await fetchProfile(account.index)
      return !profile || profile.email !== account.email
    } catch (error) {
      logError('gemini.ts:isOffline', `Error checking offline status | error: ${JSON.stringify(error?.message || error)}`)
      return true
    }
  },

  // ---- Edit conversation title ----
  async edit(conversation: any, title: string): Promise<any> {
    try {
      const account = await idb.accounts.get(conversation.accountId)
      if (!account) throw new Error('Account not found')
      
      let { index, token } = account
      if (!token) {
        const refreshed = await fetchProfile(index)
        if (refreshed?.at) {
          token = refreshed.at
          await idb.accounts.update(account.id, { token })
        } else {
          throw new Error('No auth token available')
        }
      }
      
      return batchexecute(index, token, 'MUAZcd', [null, [['title']], [`c_${conversation.id}`, title]], conversation.orgId)
    } catch (error) {
      logError('gemini.ts:edit', `Failed to edit conversation | error: ${JSON.stringify(error?.message || error)}`)
      throw error
    }
  },

  // ---- Delete conversation ----
  async delete(conversation: any): Promise<any> {
    try {
      const account = await idb.accounts.get(conversation.accountId)
      if (!account) throw new Error('Account not found')
      
      let { index, token } = account
      if (!token) {
        const refreshed = await fetchProfile(index)
        if (refreshed?.at) {
          token = refreshed.at
          await idb.accounts.update(account.id, { token })
        } else {
          throw new Error('No auth token available')
        }
      }
      
      return batchexecute(index, token, 'GzXR5e', [`c_${conversation.id}`, 1], conversation.orgId)
    } catch (error) {
      logError('gemini.ts:delete', `Failed to delete conversation | error: ${JSON.stringify(error?.message || error)}`)
      throw error
    }
  },

  // ---- Ping / connectivity check ----
  async ping(org: any): Promise<any> {
    try {
      if (!org?.accountId) {
        throw new Error('gemini.ts:ping - Invalid org or missing accountId')
      }
      
      const account = await idb.accounts.get(org.accountId)
      if (!account) {
        throw new Error(`gemini.ts:ping - Account not found: ${org.accountId}`)
      }
      
      const { index } = account
      const profile = await fetchProfile(index)
      if (!profile?.at) {
        throw new Error('Failed to get token')
      }
    } catch (error) {
      logError('gemini.ts:ping', `Failed to ping service | error: ${JSON.stringify(error?.message || error)}`)
      throw error
    }
  },
}

// ============================================================================
// 3. Account Fetch Helpers
// ============================================================================

export { fetchAllGems as fetchAllGems, fetchHeaders as fetchHeaders, fetchContent as fetchContent }
export { createConversation, fetchSummary }

// ============================================================================
// 4. onGoogleAccountFetch - Account detection from cookies
// ============================================================================

async function onGoogleAccountFetch(email: string): Promise<void> {
  chrome.cookies.get({ url: 'https://gemini.google.com', name: 'SID' }, async (cookie) => {
    const sid = cookie?.value
    
    // Check for duplicate accounts
    const duplicate = await idb.accounts.findDuplicate(email, SERVICE_ID)
    
    if (duplicate) {
      if (duplicate.id !== sid) {
        // Account ID changed - migrate org and account
        const oldOrg = await idb.orgs.get(duplicate.id)
        if (oldOrg) {
          await idb.orgs.delete(duplicate.id)
          await idb.orgs.put({ ...oldOrg, id: sid, accountId: sid } as any)
        }
        await idb.accounts.delete(duplicate.id)
        await idb.accounts.put({ ...duplicate, id: sid, index: 0, token: '' } as any)
      }
      
      // Check/update org status
      const existingOrg = await idb.orgs.get(sid)
      if (existingOrg) {
        // existingOrg.status = idb.orgs.status.New
      }
      return
    }
    
    // New account
    const account = await idb.accounts.createOrUpdate({
      serviceId: SERVICE_ID,
      id: sid,
      index: 0,
      token: '',
      email: email,
      name: email, // placeholder
    } as any)
    
    // Create org if not exists
    const existingOrg = await idb.orgs.get(account.id)
    if (!existingOrg) {
      await idb.orgs.put({
        serviceId: SERVICE_ID,
        accountId: account.id,
        email: account.email,
        name: account.name || email,
        id: account.id,
        status: idb.orgs.status.New,
      } as any)
    }
  })
}

// ============================================================================
// 5. onFetch - Network request interceptor (triggers sync on page activity)
// ============================================================================

async function onFetch(requestDetails: any, triggerSync: (org: any) => Promise<void>): Promise<void> {
  const { url } = requestDetails.request
  if (!url.includes(GEMINI_DOMAIN)) return
  
  // Extract user index from URL path
  const userIndex = parseInt(new URL(url).pathname.match(/\/u\/(\d+)/)?.[1] || '0', 10)
  
  // Extract auth token from request body
  const bodyParams = new URLSearchParams(requestDetails.request.body)
  const at = bodyParams.get('at')
  
  // If token found in request, update all gemini accounts that don't have a token
  if (at) {
    const tokenlessAccounts = await idb.accounts
      .filter((a: any) => a.serviceId === SERVICE_ID && !a.token)
      .toArray()
    for (const acc of tokenlessAccounts) {
      await idb.accounts.update(acc.id, { token: at })
    }
  }
  
  const rpcids = new URL(url).searchParams.get('rpcids')
  
  // ---- MaZiqc: Cache gem conversation list ----
  if (rpcids === 'MaZiqc' && requestDetails.response?.body) {
    try {
      const body = requestDetails.response.body
      if (Array.isArray(body) && body[2]) {
        let conversations: any[] = []
        if (typeof body[2] === 'string') {
          try {
            const parsed = JSON.parse(body[2])
            conversations = Array.isArray(parsed) ? parsed[2] || parsed : []
          } catch {
            conversations = []
          }
        } else if (Array.isArray(body[2])) {
          conversations = body[2]
        }
        
        const validConversations = conversations.filter((c: any) => c && c[7] !== null && c[7] !== undefined)
        if (validConversations.length > 0) {
          const cacheEntry = {
            timestamp: Date.now(),
            conversations: validConversations,
            index: userIndex,
          }
          await chrome.storage.local.set({ gemini_gem_cache: cacheEntry })
        }
      }
    } catch (error) {
      logError('gemini.ts:onFetch', `Failed to cache Gem conversations: ${error}`)
    }
  }
  
  // Detect whether this is a stream/generate request
  const isStreamRequest = url.includes('StreamGenerate') || url.includes('assistant.lamda')
  
  // Check if body contains "gem" or "custom_assistant" references
  const bodyStr = typeof requestDetails.request.body === 'string' ? requestDetails.request.body : ''
  const hasGemRef = url.includes('/gem/') || url.includes('gems') || 
                    bodyStr.includes('gem_') || bodyStr.includes('"gem"') || 
                    bodyStr.includes('custom_assistant')
  
  const pathname = new URL(url).pathname
  const isAppConversation = /\/app\/[a-f0-9]/.test(pathname) || 
                            /\bc_[a-f0-9]{10,}/.test(bodyStr) || 
                            hasGemRef
  
  // RPC IDs that modify conversation state
  const modifyingRPCs = ['MUAZcd', 'GzXR5e', 'PCck7e', 'qWymEb', 'CNgdBe', 'HcT8bb']
  const shouldSync = modifyingRPCs.includes(rpcids) || isStreamRequest || 
                     (isAppConversation && requestDetails.request.method === 'POST' && !!at)
  
  if (!shouldSync) {
    // Handle o30O0e (account/profile info)
    if (rpcids !== 'o30O0e' || !at) return
    
    const profile = extractProfileInfo('o30O0e', requestDetails.response.body)
    if (!profile) return
    
    let existingAccount = await idb.accounts.get(profile.id)
    if (!profile.email && existingAccount?.email) {
      profile.email = existingAccount.email
    }
    if (!profile?.email) {
      profile.email = (await fetchProfile(userIndex))?.email
    }
    
    // Handle account migration if ID changed
    if (profile.email) {
      const duplicate = await idb.accounts.findDuplicate(profile.email, SERVICE_ID)
      if (duplicate && duplicate.id !== profile.id) {
        const oldOrg = await idb.orgs.get(duplicate.id)
        await idb.orgs.delete(duplicate.id)
        await idb.orgs.put({ ...oldOrg, id: profile.id, accountId: profile.id } as any)
        await idb.accounts.delete(duplicate.id)
        existingAccount = await idb.accounts.put({ ...duplicate, id: profile.id, index: userIndex, token: at } as any)
      } else if (existingAccount) {
        await idb.accounts.update(existingAccount.id, { index: userIndex, token: at })
      } else {
        await idb.accounts.createOrUpdate({
          serviceId: SERVICE_ID,
          id: profile.id,
          index: userIndex,
          token: at,
          email: profile.email,
        } as any)
      }
    }
    
    // Update current service account
    await idb.services.put({
      id: SERVICE_ID,
      current: {
        accountId: profile.id,
        email: profile.email,
        token: at,
      },
    } as any)
    
    // Create org if needed
    const existingOrg = await idb.orgs.get(profile.id)
    if (!existingOrg) {
      if (profile.email) {
        const orgByEmail = await idb.orgs
          .filter((o: any) => o.email === profile.email && o.serviceId === SERVICE_ID)
          .first()
        if (!orgByEmail) {
          await idb.orgs.put({
            serviceId: SERVICE_ID,
            accountId: profile.id,
            ...profile,
            status: idb.orgs.status.New,
          } as any)
        }
      }
    }
    
    return
  }
  
  // ---- Trigger sync for modifying operations ----
  const { settings } = await LiveStorage.get({
    settings: { general: { manualSync: LiveStorage.defaultValue } },
  })
  if (settings.general.manualSync) return
  
  const accounts = await idb.accounts
    .filter((a: any) => a.serviceId === SERVICE_ID)
    .toArray()
  const matchingAccount = accounts.find((a: any) => a.token === at)
  if (!matchingAccount) return
  
  const org = await idb.orgs.get(matchingAccount.id)
  if (!org || !idb.orgs.isActive(org)) return
  
  // Throttle: skip if synced within last 5s
  const now = Date.now()
  const lastSync = syncThrottleCache.get(org.id) || 0
  if (now - lastSync < 5000) {
    log('gemini.ts:onFetch', `Skipping redundant sync | rpcids: ${rpcids} | orgId: ${org.id} | lastSyncAgo: ${now - lastSync}ms`)
    return
  }
  
  // PCck7e (summary) and stream requests need 1s delay before triggering
  if (rpcids === 'PCck7e' || isStreamRequest) {
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  if (rpcids !== 'PCck7e') {
    syncThrottleCache.set(org.id, Date.now())
  }
  
  await triggerSync(org)
}

// ============================================================================
// 6. Profile extraction helpers
// ============================================================================

function extractProfileInfo(rpcId: string, responseBody: any): { id: string; name?: string; email?: string } | null {
  if (!responseBody) return null
  const data = responseBody[0]?.[0]?.[2]
  if (!data) return null
  
  return {
    id: data[0],
    name: data?.[2]?.[0]?.[1],
    email: data?.[9]?.[0]?.[1],
  }
}

// ============================================================================
// 7. Auth: Token Refresh (fetchProfile)
// ============================================================================

async function fetchProfile(userIndex: number = 0): Promise<{
  at: string | null
  id: string | null
  email?: string
  name?: string
} | null> {
  try {
    // Check cache first (valid for 3 min)
    const cached = profileCache.get(userIndex)
    if (cached && cached.token && Date.now() - cached.timestamp < 180000) {
      return { at: cached.token, id: cached.id || null, email: cached.email, name: cached.name }
    }
    
    // Fetch profile page
    const url = `${GEMINI_ORIGIN}${userIndex ? `/u/${userIndex}` : ''}/app`
    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      logWarn('gemini.ts:fetchProfile', `HTTP error | status: ${response.status}`)
      return null
    }
    
    const html = await response.text()
    const profile = parseProfilePage(html)
    
    if (profile?.at) {
      profileCache.set(userIndex, {
        token: profile.at,
        timestamp: Date.now(),
        id: profile.id || null,
        email: profile.email,
        name: profile.name,
      })
    } else {
      logError('gemini.ts:fetchProfile', `No auth token extracted from profile | userIndex: ${userIndex}`)
    }
    
    return profile
  } catch (error) {
    logError('gemini.ts:fetchProfile', `Failed to fetch profile | userIndex: ${userIndex} | error: ${JSON.stringify(error?.message || error)}`)
    return null
  }
}

/** Extract quoted JSON value by key */
function extractQuotedValue(key: string, text: string): string | undefined {
  return text.match(RegExp(`"${key}":"([^"]+)"`))?.[1]
}

/** Parse profile page HTML for auth tokens and user info */
function parseProfilePage(html: string): {
  at: string | null
  id: string | null
  name?: string
  email?: string
} | null {
  // Extract SNlM0e (auth token) - try JSON first, fallback to regex
  let at: string | undefined
  try {
    at = extractQuotedValue('SNlM0e', html)
  } catch {
    at = html.match(/[a-zA-Z0-9_-]{26,30}:[0-9]{13,}/)?.[0]
  }
  
  const id = extractQuotedValue('S06Grb', html)
  const nameMatch = html.match(/:\s+([^:]+)\s+&#10;\(([^)]+)\)"/)
  
  if (nameMatch) {
    return { id: id || null, at: at || null, name: nameMatch[1].trim(), email: nameMatch[2] }
  }
  return { id: id || null, at: at || null }
}

// ============================================================================
// 8. EmptyResponseError
// ============================================================================

export class EmptyResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmptyResponseError'
  }
}

// ============================================================================
// 9. Base Request Config for batchexecute
// ============================================================================

const BASE_REQUEST = {
  serviceId: SERVICE_ID,
  method: 'POST' as const,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  },
  credentials: 'include' as RequestCredentials,
}

// ============================================================================
// 10. Response Parsing (batchexecute format)
// ============================================================================

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text()
  const url = new URL(response.url)
  const rpcids = url.searchParams.get('rpcids')
  
  // Detect Google "sorry" (CAPTCHA/rate-limit) page
  const isSorryPage = url.pathname.includes('/sorry/') || url.pathname.includes('/sorry') ||
    url.href.includes('/sorry/index') ||
    text.includes('www.google.com/sorry/') || text.includes('sorry/index') ||
    text.includes('captcha') ||
    (response.status === 200 && url.hostname.includes('google.com') && text.length < 1000 && !text.includes(rpcids))
  
  if (isSorryPage) {
    logError('gemini.ts:parser', `Google rate limit/CAPTCHA detected | url: ${url.href} | status: ${response.status} | textLength: ${text.length}`)
    
    // Mark service as rate-limited
    await idb.services.update(SERVICE_ID, { isRateLimited: true })
    emitRateLimitEvent(SERVICE_ID, true)
    
    // Show notification (throttled to once per 5 min)
    const lastNotif = rateLimitNotificationCache.get(SERVICE_ID) || 0
    if (Date.now() - lastNotif > 300000) {
      const { showRateLimitNotification } = await import(/* dynamic */ 'some-notification-module')
      const shown = await showRateLimitNotification('Gemini', 'gemini.ts:parser', 5)
      if (shown) rateLimitNotificationCache.set(SERVICE_ID, Date.now())
    }
    
    // Reset rate limit after 5 min
    setTimeout(async () => {
      await idb.services.update(SERVICE_ID, { isRateLimited: false })
      rateLimiter.reset()
      profileCache.clear()
      emitRateLimitEvent(SERVICE_ID, false)
    }, 300000)
    
    const error = new Error('Gemini rate limit detected (Google sorry page)') as any
    error.status = 429
    error.response = { status: 429 }
    throw error
  }
  
  // Detect empty responses
  if (text.includes(`"${rpcids}",null,null,null,`) && text.includes(',"generic"')) {
    throw new EmptyResponseError(`Empty response for RPC ID: ${rpcids}`)
  }
  
  const parsed = getData(rpcids, text)
  if (!parsed) {
    logWarn('gemini.ts:parser', `Failed to parse response | rpcids: ${rpcids} | responseLength: ${text.length}`)
  }
  return parsed
}

/** Extract JSON data from batchexecute's weird format */
function getData(key: string, text: string): any {
  try {
    const keyIndex = text.indexOf(key)
    if (keyIndex === -1) {
      logError('gemini.ts:getData', `Key not found in response | key: ${key} | textLength: ${text.length}`)
      return null
    }
    
    const start = keyIndex + key.length + 2
    const end = text.lastIndexOf(',null,null,null,"generic"')
    
    if (end === -1) {
      logError('gemini.ts:getData', `End marker not found | key: ${key} | textLength: ${text.length}`)
      return null
    }
    if (start >= end) {
      logError('gemini.ts:getData', `Invalid slice indices | key: ${key} | start: ${start} | end: ${end}`)
      return null
    }
    
    const slice = text.slice(start, end)
    const outerParsed = JSON.parse(slice)
    const innerParsed = JSON.parse(outerParsed)
    
    if (innerParsed && typeof innerParsed === 'object' && !Array.isArray(innerParsed)) {
      const keys = Object.keys(innerParsed)
      logError('gemini.ts:getData', `Unexpected object structure | keys: ${keys.join(', ')}`)
    }
    
    return innerParsed
  } catch (error) {
    logError('gemini.ts:getData', `Parse failed | key: ${key} | error: ${JSON.stringify(error?.message || error)}`)
    return null
  }
}

// ============================================================================
// 11. Core batchexecute RPC Wrapper
// ============================================================================

async function batchexecute(
  index: number,
  token: string,
  rpcId: string,
  args: any[],
  orgId: string,
): Promise<any> {
  try {
    await rateLimiter.throttle()
    
    // Check rate limit status before sending
    const service = await idb.services.get(SERVICE_ID)
    if (service?.isRateLimited) {
      await delay(5000) // wait 5s if rate limited
    }
    
    // Validate token
    if (!token || token === 'undefined' || token === 'null' || typeof token !== 'string') {
      logError('gemini.ts:rpc', `Invalid token for RPC call | token: ${token} | type: ${typeof token}`)
      throw new Error(`Invalid token for RPC call: ${token}`)
    }
    
    // Validate index
    if (index !== undefined && (typeof index !== 'number' || index < 0)) {
      logError('gemini.ts:rpc', `Invalid index for RPC call | index: ${index} | type: ${typeof index}`)
      throw new Error(`Invalid index for RPC call: ${index}`)
    }
    
    // Build request
    const serializedArgs = JSON.stringify(args).replaceAll('"', '\\"')
    const url = `${GEMINI_ORIGIN}${index ? `/u/${index}` : ''}/_/BardChatUi/data/batchexecute`
    const body = new URLSearchParams({
      at: token,
      'f.req': `[[["${rpcId}","${serializedArgs}",null,"generic"]]]`,
    })
    
    const result = await fetchServiceApi(url, {
      ...BASE_REQUEST,
      parser: parseResponse,
      query: { rpcids: rpcId },
      body,
      orgId,
    })
    
    return result?.parsed !== undefined ? result.parsed : result
  } catch (error: any) {
    const context = {
      rpcids: rpcId,
      status: error?.response?.status,
      message: error?.message,
      index,
      reqLength: typeof args === 'string' ? args.length : 0,
    }
    logError('gemini.ts:rpc', `RPC failed | ${JSON.stringify(context)}`)
    throw error
  }
}

// ============================================================================
// 12. fetchAllGems - Fetch all Gem (custom Gemini) conversations
// ============================================================================

let fetchLimitCache: number = 100

async function fetchAllGems(org: any): Promise<Conversation[]> {
  try {
    const account = await idb.accounts.get(org.accountId)
    if (!account) {
      logError('gemini.ts:fetchAllGems', `Account not found | orgId: ${org.id} | accountId: ${org.accountId}`)
      throw new Error('Account not found')
    }
    
    let { index, token } = account
    if (!token) {
      const profile = await fetchProfile(index)
      if (profile?.at) {
        token = profile.at
        await idb.accounts.update(account.id, { token })
      } else {
        logError('gemini.ts:fetchAllGems', `No auth token in profile | index: ${index} | accountId: ${account.id}`)
        throw new Error('No auth token available')
      }
    }
    
    const baseConversation = {
      serviceId: SERVICE_ID,
      orgId: org.id,
      accountId: account.id,
      created: 0,
    }
    
    // Step 1: Fetch Gem definitions (list of available Gems)
    const gemDefsResult = await batchexecute(index, token, 'CNgdBe', [100, null], org.id)
    if (!gemDefsResult || !gemDefsResult[2] || !Array.isArray(gemDefsResult[2])) {
      logInfo('gemini.ts:fetchAllGems', 'No Gem definitions found')
      return []
    }
    
    const gemNames: Record<string, string> = {}
    const gemList: { id: string; name: string }[] = []
    for (const entry of gemDefsResult[2]) {
      if (Array.isArray(entry) && entry[0] && entry[1]) {
        const id = entry[0]
        const name = entry[1]?.[0] || id
        gemNames[id] = name
        gemList.push({ id, name })
      }
    }
    log('gemini.ts:fetchAllGems', `Found ${gemList.length} Gem definitions`)
    
    // Step 2: Fetch conversations for each Gem
    const allConversations: Conversation[] = []
    let cursor: any = null
    let pageCount = 0
    
    do {
      const params = cursor ? [100, cursor, [0, null, 1]] : [100, null, [0, null, 1]]
      const result = await batchexecute(index, token, 'MaZiqc', params, org.id)
      
      if (!result || !Array.isArray(result) || result.length < 3) break
      
      let conversations: any[] = []
      if (typeof result[2] === 'string') {
        try {
          const parsed = JSON.parse(result[2])
          if (parsed === null || (Array.isArray(parsed) && parsed.length === 0)) {
            conversations = []
          } else if (Array.isArray(parsed) && parsed[2] && Array.isArray(parsed[2])) {
            conversations = parsed[2]
          } else if (Array.isArray(parsed)) {
            conversations = parsed
          }
        } catch (error) {
          logError('gemini.ts:fetchAllGems', `Failed to parse data[2]: ${error}`)
          conversations = []
        }
      } else if (Array.isArray(result[2])) {
        conversations = result[2]
      }
      
      for (const entry of conversations) {
        try {
          if (entry && entry[7] && typeof entry[7] === 'string') {
            const header = dataToHeader(entry)
            if (header) {
              if (header.gemId && gemNames[header.gemId]) {
                (header as any).gemName = gemNames[header.gemId]
              }
              allConversations.push({ ...baseConversation, ...header } as Conversation)
            }
          }
        } catch (error) {
          logError('gemini.ts:fetchAllGems', `Failed to process Gem conversation: ${error}`)
        }
      }
      
      cursor = result[1]
      pageCount++
      if (pageCount >= 10) {
        logError('gemini.ts:fetchAllGems', 'Reached max iterations (10), stopping')
        break
      }
    } while (cursor)
    
    log('gemini.ts:fetchAllGems', `Fetched ${allConversations.length} Gem conversations across ${pageCount} pages`)
    return allConversations
  } catch (error) {
    logError('gemini.ts:fetchAllGems', `Failed to fetch Gems: ${JSON.stringify(error?.message || error)}`)
    return []
  }
}

// ============================================================================
// 13. fetchHeaders - Paginated conversation list fetch
// ============================================================================

async function fetchHeaders(
  org: any,
  offset: number = 0,
  limit?: number,
  cursor?: string,
): Promise<{ items: Header[]; offset: number; total: number; limit: number; missing: number; next?: string }> {
  const account = await idb.accounts.get(org.accountId)
  if (!account) {
    logError('gemini.ts:fetchHeaders', `Account not found | orgId: ${org.id} | accountId: ${org.accountId}`)
    throw new Error('Account not found')
  }
  
  let { index, token } = account
  if (!token) {
    const profile = await fetchProfile(index)
    if (profile?.at) {
      token = profile.at
      await idb.accounts.update(account.id, { token })
    } else {
      logError('gemini.ts:fetchHeaders', `No auth token in profile | index: ${index} | accountId: ${account.id}`)
      throw new Error('No auth token available')
    }
  }
  
  try {
    const effectiveLimit = Math.min(Math.max(1, fetchLimitCache || 100), 100)
    const effectiveCursor = (cursor === null || cursor === undefined || cursor === '') ? null : cursor
    const params = effectiveCursor ? [effectiveLimit, effectiveCursor, [0, null, 1]] : [effectiveLimit, null]
    
    const result = await batchexecute(index, token, 'MaZiqc', params, org.id)
    
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const keys = Object.keys(result)
      logError('gemini.ts:fetchHeaders', `Unexpected data structure | keys: ${keys.join(', ')}`)
    }
    
    if (!result) {
      return { items: [], offset, total: offset, limit: effectiveLimit, missing: 0 }
    }
    if (!Array.isArray(result) || result.length < 3) {
      return { items: [], offset, total: Math.min(offset, geminiService.maxLimit), limit: fetchLimitCache || 100, missing: 0 }
    }
    
    const baseHeader: Partial<Header> = {
      serviceId: SERVICE_ID,
      orgId: org.id,
      accountId: org.accountId,
      created: 0,
    }
    
    let rawConversations: any[] = []
    if (typeof result[2] === 'string') {
      try {
        const parsed = JSON.parse(result[2])
        if (parsed === null || (Array.isArray(parsed) && parsed.length === 0)) {
          rawConversations = []
        } else if (Array.isArray(parsed) && parsed[2] && Array.isArray(parsed[2])) {
          rawConversations = parsed[2]
        } else if (Array.isArray(parsed)) {
          rawConversations = parsed
        }
      } catch (error) {
        logError('gemini.ts:fetchHeaders', `Failed to parse string data[2]: ${error}`)
        rawConversations = []
      }
    } else if (Array.isArray(result[2])) {
      rawConversations = result[2]
    }
    
    const headers: Header[] = []
    let failedCount = 0
    
    for (const entry of rawConversations) {
      try {
        const header = dataToHeader(entry)
        if (header) {
          headers.push({ ...baseHeader, ...header } as Header)
        } else {
          failedCount++
        }
      } catch (error) {
        logError('gemini.ts:fetchHeaders', `Failed to process conversation: ${error}`)
        failedCount++
      }
    }
    
    const total = result[1] ? geminiService.maxLimit : Math.min(offset + headers.length, geminiService.maxLimit)
    const nextCursor = result[1] || undefined
    
    // Update fetch limit cache
    if (!fetchLimitCache && result[1]) {
      fetchLimitCache = headers.length
    }
    
    logInfo('gemini.ts:fetchHeaders',
      `Completed | offset: ${offset} | returned ${headers.length} conversations | total so far: ${offset + headers.length} | failed: ${failedCount} | ${nextCursor ? `hasNext: true | cursorLength: ${typeof nextCursor === 'string' ? nextCursor.length : 'N/A'}` : 'hasNext: false (API returned no cursor - possible API limit)'}`
    )
    
    return {
      items: headers,
      offset,
      total,
      limit: effectiveLimit || headers.length,
      missing: 0,
      next: nextCursor,
    }
  } catch (error: any) {
    const context = {
      message: error?.message || 'Unknown error',
      status: error?.response?.status,
      orgId: org.id,
      accountId: org.accountId,
      hasToken: !!token,
      fetchLimit: fetchLimitCache,
      nextCursor: cursor,
      offset,
    }
    logError('gemini.ts:fetchHeaders', `Failed to fetch headers | details: ${JSON.stringify(context)}`)
    
    // Auto-retry with token refresh on 400
    if (error?.response?.status === 400) {
      try {
        const refreshed = await fetchProfile(index)
        if (!refreshed?.at) {
          logError('gemini.ts:fetchHeaders', 'No auth token available after refresh attempt')
          return { items: [], offset, total: offset, limit: fetchLimitCache || 100, missing: 0 }
        }
        
        await idb.accounts.update(account.id, { token: refreshed.at })
        
        const retryLimit = Math.min(Math.max(1, fetchLimitCache || 100), 100)
        const retryParams = [retryLimit, (cursor === null || cursor === '' ? null : cursor)]
        const retryResult = await batchexecute(index, refreshed.at, 'MaZiqc', retryParams, org.id)
        
        if (!retryResult) {
          return { items: [], offset, total: offset, limit: retryLimit, missing: 0 }
        }
        if (!Array.isArray(retryResult) || retryResult.length < 3) {
          logError('gemini.ts:fetchHeaders', `Invalid response structure after retry | data: ${JSON.stringify(retryResult)}`)
          return { items: [], offset, total: offset, limit: retryLimit, missing: 0 }
        }
        
        const baseHeader: Partial<Header> = {
          serviceId: SERVICE_ID,
          orgId: org.id,
          accountId: org.accountId,
          created: 0,
        }
        const rawConvs = Array.isArray(retryResult[2]) ? retryResult[2] : []
        const items = rawConvs.map((e: any) => ({ ...baseHeader, ...dataToHeader(e) } as Header)) || []
        const totalCount = retryResult[1] ? geminiService.maxLimit : Math.min(offset + items.length, geminiService.maxLimit)
        
        return { items, offset, total: totalCount, limit: retryLimit, missing: 0, next: retryResult[1] || undefined }
      } catch (retryError: any) {
        logError('gemini.ts:fetchHeaders',
          `Token refresh/retry failed | error: ${JSON.stringify(retryError?.message || retryError)} | status: ${retryError?.response?.status}`
        )
        if (retryError?.response?.status === 400) {
          return { items: [], offset, total: offset, limit: fetchLimitCache || 100, missing: 0 }
        }
      }
    }
    
    throw error
  }
}

// ============================================================================
// 14. dataToHeader - Parse conversation data from raw array format
// ============================================================================

function dataToHeader(data: any[]): any {
  try {
    const [id, title, , , , timestamp, , gemId] = data
    
    if (!id || !title || !timestamp) {
      logWarn('gemini.ts:dataToHeader', `Missing required fields | id: ${id} | title: ${title} | timestamp: ${timestamp}`)
      return null
    }
    
    // Timestamp can be an array (take first element)
    const rawTimestamp = Array.isArray(timestamp) ? timestamp[0] : timestamp
    if (rawTimestamp === undefined || rawTimestamp === null) {
      logWarn('gemini.ts:dataToHeader', `Invalid timestamp | data: ${JSON.stringify(data)}`)
      return null
    }
    
    // Extract the conversation ID after "c_" prefix
    const idParts = id.split('_')
    const strippedId = idParts[1]
    if (!strippedId) {
      logWarn('gemini.ts:dataToHeader', `Invalid conversation ID format | id: ${id}`)
      return null
    }
    
    const header: any = {
      id: strippedId,
      title,
      updated: rawTimestamp * 1000, // Convert seconds to ms
    }
    
    if (gemId && typeof gemId === 'string') {
      header.gemId = gemId
    }
    
    return header
  } catch (error) {
    logError('gemini.ts:dataToHeader', `Failed to parse conversation data | error: ${error} | data: ${JSON.stringify(data)}`)
    return null
  }
}

// ============================================================================
// 15. fetchContent - Fetch full conversation with message pagination
// ============================================================================

async function fetchContent(conversation: any): Promise<Conversation | null> {
  try {
    const account = await idb.accounts.get(conversation.accountId)
    if (!account) {
      logError('gemini.ts:fetchContent', `Account not found | accountId: ${conversation.accountId} | conversationId: ${conversation.id}`)
      throw new Error('Account not found for content fetch')
    }
    
    const { index, token } = account
    let allMessages: any[] = []
    let cursor: any = null
    let iterationCount = 0
    
    // Paginate through messages (max 50 pages)
    for (iterationCount = 0; iterationCount < 50; iterationCount++) {
      const params = [`c_${conversation.id}`, 100, cursor, 1, [1]]
      const result = await batchexecute(index, token, 'hNvQHb', params, conversation.orgId)
      
      if (!Array.isArray(result) || !Array.isArray(result[0])) {
        if (iterationCount === 0) return null
        break
      }
      
      const pageMessages = result[0]
      if (pageMessages.length > 0) {
        allMessages = allMessages.concat(pageMessages)
      }
      
      const nextCursor = result[1]
      if (!nextCursor || nextCursor === cursor) break
      cursor = nextCursor
    }
    
    if (allMessages.length === 0) {
      logError('gemini.ts:fetchContent', `No messages found | conversationId: ${conversation.id}`)
      return null
    }
    
    // Parse messages (reverse order due to API response format)
    const parsedMessages = allMessages
      .reverse()
      .map(msgToIdb)
      .filter((m): m is Message[] => m !== null && Array.isArray(m))
      .flat()
    
    // Sort by timestamp ascending
    parsedMessages.sort((a: Message, b: Message) => a.timestamp - b.timestamp)
    
    if (parsedMessages.length === 0) {
      logError('gemini.ts:fetchContent', `No valid messages after processing | conversationId: ${conversation.id}`)
      return null
    }
    
    const created = parsedMessages[0].timestamp
    const lastMessage = parsedMessages[parsedMessages.length - 1]
    
    return {
      id: conversation.id,
      orgId: conversation.orgId,
      serviceId: conversation.serviceId,
      title: conversation.title,
      created,
      updated: lastMessage.timestamp,
      currentMessage: lastMessage.id,
      messages: parsedMessages,
    }
  } catch (error: any) {
    if (error.name === 'EmptyResponseError' || error.message?.includes('Failed to parse response for RPC ID: hNvQHb')) {
      return null
    }
    logError('gemini.ts:fetchContent', `Failed to fetch content | conversationId: ${conversation.id} | error: ${JSON.stringify(error?.message || error)}`)
    throw error
  }
}

// ============================================================================
// 16. msgToIdb - Parse individual message from raw data
// ============================================================================

function msgToIdb(data: any[]): [Message, Message] | null {
  try {
    const [idPair, parentInfo, content, response, timestamp] = data
    
    if (!idPair || !content || !response || !timestamp) {
      logWarn('gemini.ts:msgToIdb', `Skipped message with null structure | idPair: ${!!idPair} | content: ${!!content} | response: ${!!response} | timestamp: ${!!timestamp}`)
      return null
    }
    
    const messageId = idPair[1]
    const userContent = content[0]?.[0]
    const responseData = response[0]?.[0]
    const responseId = responseData?.[0]
    const responseText = responseData?.[1]?.[0]
    const rawTimestamp = timestamp[0]
    
    // Extract IDs after "_" separator
    const parentId = parentInfo?.[1]?.includes('_') ? parentInfo[1].split('_')[1] : null
    const msgId = messageId?.includes('_') ? messageId.split('_')[1] : null
    const resId = responseId?.includes('_') ? responseId.split('_')[1] : null
    
    if (!msgId || !resId) {
      logWarn('gemini.ts:msgToIdb', `Skipped malformed message | msgId: ${msgId || 'null'} | resId: ${resId || 'null'} | id: ${messageId} | resp: ${responseId}`)
      return null
    }
    
    const ts = rawTimestamp * 1000 // Convert to ms
    
    return [
      {
        id: msgId,
        parent: parentId,
        role: 'user',
        content: userContent || null,
        timestamp: ts - 3, // Slightly before response
      },
      {
        id: resId,
        parent: msgId,
        role: 'assistant',
        content: responseText || null,
        timestamp: ts,
      },
    ]
  } catch (error) {
    logWarn('gemini.ts:msgToIdb', `Failed to parse message | error: ${JSON.stringify(error?.message || error)}`)
    return null
  }
}

// ============================================================================
// 17. StreamGenerate Response Parser
// ============================================================================

async function parseStreamResponse(response: Response): Promise<{ id?: string; response: string }> {
  const text = await response.text()
  
  // Normalize the weird JSON format
  const normalized = text.replace(/^[^\w]*\[\["wrb.fr"/, '[["wrb.fr"')
  const parsed = JSON.parse(normalized)
  
  let conversationId: string | undefined
  let responseContent: string | undefined
  
  for (const entry of parsed) {
    if (!Array.isArray(entry) || entry[0] !== 'wrb.fr') continue
    
    const data = entry[2]
    if (data && typeof data === 'string') {
      try {
        const inner = JSON.parse(data)
        
        // Extract conversation ID from first response
        if (!conversationId) {
          const idCandidate = inner[1]?.[0]?.split('_')[1]
          if (idCandidate) conversationId = idCandidate
        }
        
        // Extract response text
        const responseBlock = inner[4]?.[0]?.[1]?.[0]
        if (responseBlock && typeof responseBlock === 'string' && responseBlock.length > 10) {
          responseContent = responseBlock
          break
        }
        
        // Fallback: try alternative path
        if (!responseContent) {
          const altBlock = inner[4]?.[0]?.[0]
          if (altBlock && typeof altBlock === 'string' && altBlock.length > 10) {
            responseContent = altBlock
          }
        }
      } catch {
        continue
      }
    }
  }
  
  if (!responseContent) {
    throw new Error('Failed to parse Gemini response: no response content found')
  }
  
  return { id: conversationId, response: responseContent }
}

// ============================================================================
// 18. createConversation - Create new conversation via StreamGenerate
// ============================================================================

async function createConversation(orgId: string, prompt: string, signal?: AbortSignal): Promise<any> {
  try {
    const account = await idb.accounts.get(orgId)
    if (!account) {
      logError('gemini.ts:createConversation', `Account not found for conversation creation | orgId: ${orgId}`)
      throw new Error('Account not found for conversation creation')
    }
    
    const { index } = account
    const profile = await fetchProfile(index)
    if (!profile?.at) {
      logError('gemini.ts:createConversation', `No auth token for conversation | orgId: ${orgId} | index: ${index}`)
      throw new Error('No auth token available for conversation creation')
    }
    
    const { at } = profile
    const body = new URLSearchParams({
      at,
      'f.req': `[null,${JSON.stringify(JSON.stringify([[prompt]]))}]`,
    })
    
    const result = await fetchServiceApi(STREAM_GENERATE_URL, {
      ...BASE_REQUEST,
      body,
      parser: parseStreamResponse,
      signal,
    })
    
    if ('networkError' in result || 'offline' in result) {
      logError('gemini.ts:createConversation', `Network error creating conversation | orgId: ${orgId} | response: ${JSON.stringify(result)}`)
      throw new Error('Network error while creating conversation')
    }
    
    const parsed = result?.parsed !== undefined ? result.parsed : result
    return { orgId, ...parsed }
  } catch (error: any) {
    logError('gemini.ts:createConversation', `Failed to create conversation | orgId: ${orgId} | error: ${JSON.stringify(error?.message || error)}`)
    if (error?.statusCode) captureException(error)
    throw error
  }
}

// ============================================================================
// 19. fetchSummary - Summarization function wrapper
// ============================================================================

async function fetchSummary(
  orgId: string,
  prompt: string,
  systemPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    if (systemPrompt) {
      prompt = `${systemPrompt}\n${prompt}`
    }
    
    const { settings } = await LiveStorage.get({
      settings: { summary: { orgId: LiveStorage.defaultValue } },
    })
    
    const activeOrgId = settings.summary.orgId
    if (!activeOrgId) {
      logError('gemini.ts:fetchSummary', 'No active account configured for summary')
      throw new Error('No active Account')
    }
    
    const result = await createConversation(activeOrgId, prompt, signal)
    
    // Delete the temporary conversation created for summarization
    await geminiService.delete({
      serviceId: SERVICE_ID,
      accountId: activeOrgId,
      orgId: result.orgId,
      id: result.id,
    } as any)
    
    return result.response
  } catch (error) {
    throw error
  }
}

// ============================================================================
// 20. searchGeminiConversations - Search conversations by query
// ============================================================================

export async function searchGeminiConversations(query: string, account: any): Promise<any[]> {
  try {
    if (!query || query.trim().length === 0) return []
    
    const accountRecord = await idb.accounts.get(account.accountId)
    if (!accountRecord) {
      logError('gemini.ts:searchGeminiConversations', `Account not found | orgId: ${account.id}`)
      throw new Error('Account not found')
    }
    
    let { index, token } = accountRecord
    if (!token) {
      const refreshed = await fetchProfile(index)
      if (refreshed?.at) {
        token = refreshed.at
        await idb.accounts.update(accountRecord.id, { token })
      } else {
        logError('gemini.ts:searchGeminiConversations', `No auth token | index: ${index}`)
        throw new Error('No auth token available')
      }
    }
    
    log('gemini.ts:searchGeminiConversations', `Searching Gemini | query: ${query} | orgId: ${account.id}`)
    const result = await batchexecute(index, token, 'unqWSc', [query], account.id)
    
    return parseSearchResults(result)
  } catch (error) {
    logError('gemini.ts:searchGeminiConversations', `Search failed | query: ${query} | error: ${JSON.stringify(error)}`)
    throw error
  }
}

function parseSearchResults(data: any): any[] {
  const results: any[] = []
  
  try {
    if (!data || !Array.isArray(data)) {
      log('gemini.ts:parseSearchResults', 'No data or invalid data format')
      return results
    }
    
    const rows = data[0]
    if (!Array.isArray(rows)) {
      log('gemini.ts:parseSearchResults', 'No search results array found')
      return results
    }
    
    for (const row of rows) {
      try {
        const rowData = row[0]
        if (!Array.isArray(rowData)) continue
        
        const rawId = rowData[0]
        if (!rawId || typeof rawId !== 'string' || !rawId.startsWith('c_')) continue
        
        const id = rawId.substring(2)
        const title = rowData[1] || 'Untitled'
        let updated = Date.now()
        
        const timestampData = row[2]
        if (Array.isArray(timestampData) && timestampData.length > 0) {
          const outer = timestampData[0]
          if (Array.isArray(outer) && outer.length > 3) {
            const inner = outer[3]
            if (Array.isArray(inner) && inner.length > 0) {
              const timestamp = inner[0]
              updated = timestamp > 1e12 ? timestamp : timestamp * 1000
            }
          }
        }
        
        results.push({ id, title, updated })
      } catch (error) {
        logWarn('gemini.ts:parseSearchResults', `Failed to parse search result item | error: ${error}`)
        continue
      }
    }
    
    log('gemini.ts:parseSearchResults', `Parsed ${results.length} search results`)
    return results
  } catch (error) {
    logError('gemini.ts:parseSearchResults', `Failed to parse search results | error: ${JSON.stringify(error)}`)
    return results
  }
}

// ============================================================================
// 21. syncMissingFromSearch - Sync conversations found in search but not in DB
// ============================================================================

export async function syncMissingFromSearch(
  searchResults: any[],
  org: any,
  progressCallback?: (current: number, total: number) => void,
): Promise<any[]> {
  try {
    if (!searchResults || searchResults.length === 0) return []
    
    // Find which search results are NOT in our local database
    const localHeaders = await idb.headers.where('orgId').equals(org.id).toArray()
    const localIds = new Set(localHeaders.map((h: Header) => h.id))
    const missingItems = searchResults.filter((r: any) => !localIds.has(r.id))
    
    if (missingItems.length === 0) {
      log('gemini.ts:syncMissingFromSearch', 'No missing conversations to sync')
      return []
    }
    
    log('gemini.ts:syncMissingFromSearch', `Found ${missingItems.length} missing conversations to sync`)
    
    const synced: any[] = []
    
    for (const item of missingItems) {
      try {
        // Save header
        const header: Header = {
          id: item.id,
          orgId: org.id,
          accountId: org.accountId as string,
          serviceId: 'gemini',
          title: item.title,
          created: item.updated,
          updated: item.updated,
        } as Header
        
        await idb.headers.put(header)
        synced.push(header)
        progressCallback?.(synced.length, missingItems.length)
        
        // Fetch and save full conversation content
        try {
          const conversation = await fetchContent({ ...header, orgId: org.id, accountId: org.accountId })
          if (conversation) {
            await idb.conversations.put(conversation)
            log('gemini.ts:syncMissingFromSearch', `Synced conversation | id: ${item.id}`)
          }
        } catch (contentError) {
          logError('gemini.ts:syncMissingFromSearch', `Failed to fetch content | id: ${item.id} | error: ${JSON.stringify(contentError)}`)
        }
      } catch (headerError) {
        logError('gemini.ts:syncMissingFromSearch', `Failed to save header | id: ${item.id} | error: ${JSON.stringify(headerError)}`)
        continue
      }
    }
    
    log('gemini.ts:syncMissingFromSearch', `Successfully synced ${synced.length} conversations`)
    
    // Update org cached counts
    if (synced.length > 0) {
      try {
        await idb.orgs.updateCounts(org.id)
        log('gemini.ts:syncMissingFromSearch', `Updated cached counts for org: ${org.id}`)
      } catch (countError) {
        logError('gemini.ts:syncMissingFromSearch', `Failed to update counts | error: ${JSON.stringify(countError)}`)
      }
    }
    
    return synced
  } catch (error) {
    logError('gemini.ts:syncMissingFromSearch', `Sync failed | error: ${JSON.stringify(error)}`)
    throw error
  }
}
