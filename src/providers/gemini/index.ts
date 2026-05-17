import { log, logInfo, logError, logWarn } from '../../log'
import { idb } from '../../idb'
import { delay, fetchServiceApi, captureException } from '../../common'
import {
  type ConversationProvider,
} from '../provider-interface'
import {
  type ProviderConfig,
  type Account,
  type AuthProfile,
  type Header,
  type Conversation,
  type PaginatedResult,
  type SearchResult,
  type RequestDetails,
  type SyncTrigger,
  OrgStatus,
} from '../../types'
import { fetchProfile, clearProfileCache } from './auth'
import { batchexecute, parseStreamResponse, EmptyResponseError, GEMINI_ORIGIN, parseResponse } from './rpc'
import { dataToHeader, msgToIdb, parseSearchResults } from './parser'
import { handleNetworkActivity, onGoogleAccountFetch } from './network'
import { LiveStorage } from '../../LiveStorage'

const SERVICE_ID = 'gemini'
const GEMINI_DOMAIN = 'gemini.google.com'
const STREAM_GENERATE_URL = `${GEMINI_ORIGIN}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`

export class GeminiProvider implements ConversationProvider {
  readonly id = SERVICE_ID
  readonly name = 'Gemini'
  readonly config: ProviderConfig = {
    id: SERVICE_ID,
    name: 'Gemini',
    domain: GEMINI_DOMAIN,
    origins: ['https://gemini.google.com/*'],
    capabilities: [
      { type: 'conversation-list', label: 'List Conversations', description: 'List all conversations with pagination' },
      { type: 'message-fetch', label: 'Fetch Messages', description: 'Download full conversation history' },
      { type: 'search', label: 'Search', description: 'Search conversations by text query' },
      { type: 'auto-sync', label: 'Auto Sync', description: 'Automatically sync on network activity' },
      { type: 'edit-title', label: 'Edit Title', description: 'Rename conversations' },
      { type: 'delete-conversation', label: 'Delete', description: 'Delete conversations' },
      { type: 'create-conversation', label: 'Create', description: 'Create new conversations' },
      { type: 'summary', label: 'Summarize', description: 'Generate summaries using Gemini' },
    ],
  }

  async init(): Promise<void> {
    // Gemini auth bootstraps from cookies — handled by network interceptor
  }

  async destroy(): Promise<void> {
    clearProfileCache()
  }

  // ── Authentication ──

  async detectAccounts(): Promise<Account[]> {
    const maxAccounts = 10
    const seenEmails = new Set<string>()
    const found: Account[] = []

    for (let i = 0; i < maxAccounts; i++) {
      try {
        const profile = await fetchProfile(i)
        if (!profile?.at) continue

        const email = profile.email || ''
        if (seenEmails.has(email)) continue
        seenEmails.add(email)

        const cookie = await new Promise<chrome.cookies.Cookie | null>(resolve => {
          chrome.cookies.get({ url: 'https://gemini.google.com', name: 'SID' }, resolve)
        })
        if (!cookie?.value) continue

        // Use email-based ID for stability and backward compatibility
        const accountId = email ? email : `${cookie.value}${i > 0 ? `_${i}` : ''}`

        const existing = await idb.accounts.get(accountId)
        const account: Account = {
          id: accountId,
          serviceId: SERVICE_ID,
          index: i,
          token: profile.at,
          email,
          name: profile.name,
        }
        await idb.accounts.put(account)

        if (!existing) {
          const existingOrg = await idb.orgs.get(accountId)
          if (!existingOrg) {
            await idb.orgs.put({
              serviceId: SERVICE_ID,
              accountId: account.id,
              email: account.email,
              name: account.name || account.email,
              id: account.id,
              status: OrgStatus.New,
            })
          }
        }

        found.push(account)
      } catch {
        continue
      }
    }

    return found
  }

  async refreshAuth(account: Account): Promise<AuthProfile | null> {
    const profile = await fetchProfile(account.index)
    if (profile?.at) {
      await idb.accounts.update(account.id, { token: profile.at })
    }
    return profile
  }

  async isAuthenticated(account: Account): Promise<boolean> {
    const profile = await fetchProfile(account.index)
    return !!(profile && (profile.email === account.email || !account.email))
  }

  async onAccountDetected(email: string): Promise<void> {
    await onGoogleAccountFetch(email)
  }

  // ── Data Operations ──

  async listConversations(
    account: Account,
    cursor?: string,
    limit?: number,
  ): Promise<PaginatedResult<Header>> {
    const result = await fetchHeadersInternal(account, 0, limit, cursor)
    return result
  }

  async getConversation(account: Account, conversationId: string): Promise<Conversation | null> {
    const header = await idb.headers.get(conversationId)
    const conversation = header ? { ...header, accountId: account.id, orgId: account.id } : { id: conversationId, accountId: account.id, orgId: account.id }
    return fetchContentInternal(conversation, account)
  }

  async search(account: Account, query: string): Promise<SearchResult[]> {
    return searchGeminiConversationsInternal(query, account)
  }

  // ── Mutations ──

  async editTitle(account: Account, conversationId: string, title: string): Promise<void> {
    await editConversationInternal(account, conversationId, title)
  }

  async deleteConversation(account: Account, conversationId: string): Promise<void> {
    await deleteConversationInternal(account, conversationId)
  }

  async createConversation(account: Account, prompt: string, signal?: AbortSignal): Promise<Conversation> {
    return createConversationInternal(account.id, prompt, signal)
  }

  async summarize(account: Account, prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<string> {
    return fetchSummaryInternal(account.id, prompt, systemPrompt, signal)
  }

  // ── Network / Auto-Sync ──

  async handleNetworkActivity(details: RequestDetails): Promise<SyncTrigger | null> {
    return handleNetworkActivity(details)
  }

  async getChatUrl(conversation: Header): Promise<string> {
    return getChatUrlInternal(conversation)
  }

  // ── Status ──

  async isOffline(accountId: string): Promise<boolean> {
    return isOffline(accountId)
  }

  async ping(account: Account): Promise<boolean> {
    try {
      const profile = await fetchProfile(account.index)
      return !!profile?.at
    } catch {
      return false
    }
  }

  hasCapability(type: string): boolean {
    return this.config.capabilities.some(c => c.type === type)
  }

  readonly supportedCapabilities: string[] = [
    'conversation-list', 'message-fetch', 'search', 'create-conversation',
    'edit-title', 'delete-conversation', 'ping', 'get-chat-url',
    'fetch-all-gems', 'fetch-summary', 'auto-sync', 'is-offline',
    'detect-accounts', 'refresh-auth', 'is-authenticated', 'reset-rate-limit',
  ]
}

// ============================================================================
// Internal helper functions (faithful to original gemini.ts)
// ============================================================================

async function getChatUrlInternal(conversation: any): Promise<string> {
  try {
    if (!conversation?.id) {
      throw new Error('gemini:getChatUrl - Invalid conversation id')
    }

    const header = conversation.serviceId
      ? conversation
      : await idb.headers.get(conversation.id)

    const account = header?.accountId
      ? await idb.accounts.get(header.accountId)
      : null

    const userPrefix = account?.index ? `/u/${account.index}` : ''

    if (header?.gemId) {
      return `https://${GEMINI_DOMAIN}${userPrefix}/gem/${header.gemId}/${conversation.id}`
    }
    return `https://${GEMINI_DOMAIN}${userPrefix}/app/${conversation.id}`
  } catch (error: any) {
    logError('gemini:getChatUrl', `Failed | error: ${JSON.stringify(error?.message || error)}`)
    throw error
  }
}

async function ensureToken(account: Account): Promise<{ token: string; index: number }> {
  let { index, token } = account
  if (!token) {
    const profile = await fetchProfile(index)
    if (profile?.at) {
      token = profile.at
      await idb.accounts.update(account.id, { token })
    } else {
      throw new Error('No auth token available')
    }
  }
  return { token, index }
}

async function editConversationInternal(account: Account, conversationId: string, title: string): Promise<void> {
  const { index, token } = await ensureToken(account)
  await batchexecute(index, token, 'MUAZcd', [null, [['title']], [`c_${conversationId}`, title]], account.id)
}

async function deleteConversationInternal(account: Account, conversationId: string): Promise<void> {
  const { index, token } = await ensureToken(account)
  await batchexecute(index, token, 'GzXR5e', [`c_${conversationId}`, 1], account.id)
}

let fetchLimitCache: number = 100

async function fetchHeadersInternal(
  org: any,
  offset: number = 0,
  limit?: number,
  cursor?: string,
): Promise<PaginatedResult<Header>> {
  const account = await idb.accounts.get(org.accountId || org.id)
  if (!account) {
    throw new Error('Account not found')
  }

  let { index, token } = account
  if (!token) {
    const profile = await fetchProfile(index)
    if (profile?.at) {
      token = profile.at
      await idb.accounts.update(account.id, { token })
    } else {
      throw new Error('No auth token available')
    }
  }

  try {
    const effectiveLimit = Math.min(Math.max(1, fetchLimitCache || 100), 100)
    const effectiveCursor = (!cursor || cursor === '') ? null : cursor
    const params = effectiveCursor ? [effectiveLimit, effectiveCursor, [0, null, 1]] : [effectiveLimit, null]

    const result = await batchexecute(index, token, 'MaZiqc', params, org.id)

    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const keys = Object.keys(result)
      logError('gemini:fetchHeaders', `Unexpected data structure | keys: ${keys.join(', ')}`)
    }

    if (!result) {
      return { items: [], offset, total: offset, limit: effectiveLimit, missing: 0 }
    }
    if (!Array.isArray(result) || result.length < 3) {
      return { items: [], offset, total: Math.min(offset, 500), limit: fetchLimitCache || 100, missing: 0 }
    }

    const baseHeader: Partial<Header> = {
      serviceId: SERVICE_ID,
      orgId: org.id,
      accountId: org.accountId || org.id,
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
      } catch {
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
      } catch {
        failedCount++
      }
    }

    const total = result[1] ? 500 : Math.min(offset + headers.length, 500)
    const nextCursor = result[1] || undefined

    if (!fetchLimitCache && result[1]) {
      fetchLimitCache = headers.length
    }

    logInfo('gemini:fetchHeaders',
      `Completed | offset: ${offset} | returned ${headers.length} conversations | total so far: ${offset + headers.length} | failed: ${failedCount} | ${nextCursor ? 'hasNext: true' : 'hasNext: false'}`
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
    if (error?.response?.status === 400) {
      try {
        const refreshed = await fetchProfile(index)
        if (!refreshed?.at) {
          return { items: [], offset, total: offset, limit: fetchLimitCache || 100, missing: 0 }
        }
        await idb.accounts.update(account.id, { token: refreshed.at })

        const retryLimit = Math.min(Math.max(1, fetchLimitCache || 100), 100)
        const retryParams = [retryLimit, (!cursor || cursor === '' ? null : cursor)]
        const retryResult = await batchexecute(index, refreshed.at, 'MaZiqc', retryParams, org.id)

        if (!retryResult || !Array.isArray(retryResult) || retryResult.length < 3) {
          return { items: [], offset, total: offset, limit: retryLimit, missing: 0 }
        }

        const baseHeader: Partial<Header> = {
          serviceId: SERVICE_ID,
          orgId: org.id,
          accountId: org.accountId || org.id,
          created: 0,
        }
        const rawConvs = Array.isArray(retryResult[2]) ? retryResult[2] : []
        const items = rawConvs.map((e: any) => ({ ...baseHeader, ...dataToHeader(e) } as Header)).filter(Boolean)
        const totalCount = retryResult[1] ? 500 : Math.min(offset + items.length, 500)

        return { items, offset, total: totalCount, limit: retryLimit, missing: 0, next: retryResult[1] || undefined }
      } catch (retryError: any) {
        if (retryError?.response?.status === 400) {
          return { items: [], offset, total: offset, limit: fetchLimitCache || 100, missing: 0 }
        }
      }
    }
    throw error
  }
}

async function fetchContentInternal(conversation: any, account?: Account): Promise<Conversation | null> {
  try {
    const acc = account || await idb.accounts.get(conversation.accountId)
    if (!acc) {
      throw new Error('Account not found for content fetch')
    }

    const { index, token } = await ensureToken(acc)
    let allMessages: any[] = []
    let cursor: any = null
    let iterationCount = 0

    for (iterationCount = 0; iterationCount < 50; iterationCount++) {
      const params = [`c_${conversation.id}`, 100, cursor, 1, [1]]
      const result = await batchexecute(index, token, 'hNvQHb', params, conversation.orgId || conversation.id)

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
      return null
    }

    const parsedMessages = allMessages
      .reverse()
      .map(msgToIdb)
      .filter((m): m is any => m !== null && Array.isArray(m))
      .flat()

    parsedMessages.sort((a: any, b: any) => a.timestamp - b.timestamp)

    if (parsedMessages.length === 0) {
      return null
    }

    const created = parsedMessages[0].timestamp
    const lastMessage = parsedMessages[parsedMessages.length - 1]

    return {
      id: conversation.id,
      orgId: conversation.orgId || conversation.id,
      serviceId: SERVICE_ID,
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
    throw error
  }
}

async function searchGeminiConversationsInternal(query: string, account: any): Promise<any[]> {
  try {
    if (!query || query.trim().length === 0) return []

    const accountRecord = await idb.accounts.get(account.accountId || account.id)
    if (!accountRecord) {
      throw new Error('Account not found')
    }

    let { index, token } = accountRecord
    if (!token) {
      const refreshed = await fetchProfile(index)
      if (refreshed?.at) {
        token = refreshed.at
        await idb.accounts.update(accountRecord.id, { token })
      } else {
        throw new Error('No auth token available')
      }
    }

    const result = await batchexecute(index, token, 'unqWSc', [query], account.id)
    return parseSearchResults(result)
  } catch (error) {
    logError('gemini:search', `Search failed | query: ${query} | error: ${JSON.stringify(error)}`)
    throw error
  }
}

async function createConversationInternal(orgId: string, prompt: string, signal?: AbortSignal): Promise<any> {
  try {
    const account = await idb.accounts.get(orgId)
    if (!account) {
      throw new Error('Account not found for conversation creation')
    }

    const { index } = account
    const profile = await fetchProfile(index)
    if (!profile?.at) {
      throw new Error('No auth token available for conversation creation')
    }

    const { at } = profile
    const body = new URLSearchParams({
      at,
      'f.req': `[null,${JSON.stringify(JSON.stringify([[prompt]]))}]`,
    })

    const result = await fetchServiceApi(STREAM_GENERATE_URL, {
      serviceId: SERVICE_ID,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      credentials: 'include',
      body,
      parser: parseStreamResponse,
      signal,
    } as any)

    if ('networkError' in result || 'offline' in result) {
      throw new Error('Network error while creating conversation')
    }

    const parsed = result?.parsed !== undefined ? result.parsed : result
    return { orgId, ...parsed }
  } catch (error: any) {
    logError('gemini:create', `Failed to create conversation | orgId: ${orgId} | error: ${JSON.stringify(error?.message || error)}`)
    if (error?.statusCode) captureException(error)
    throw error
  }
}

async function fetchSummaryInternal(
  orgId: string,
  prompt: string,
  systemPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    if (systemPrompt) {
      prompt = `${systemPrompt}\n${prompt}`
    }

    const account = await idb.accounts.get(orgId)
    if (!account) {
      throw new Error('No active Account')
    }

    const result = await createConversationInternal(orgId, prompt, signal)

    // Delete the temporary conversation
    try {
      const { index, token } = await ensureToken(account)
      await batchexecute(index, token, 'GzXR5e', [`c_${result.id}`, 1], orgId)
    } catch {
      // Best-effort cleanup
    }

    return result.response
  } catch (error) {
    throw error
  }
}

export async function fetchAllGems(org: any): Promise<any[]> {
  try {
    const account = await idb.accounts.get(org.accountId || org.id)
    if (!account) {
      throw new Error('Account not found')
    }

    let { index, token } = account
    if (!token) {
      const profile = await fetchProfile(index)
      if (profile?.at) {
        token = profile.at
        await idb.accounts.update(account.id, { token })
      } else {
        throw new Error('No auth token available')
      }
    }

    const baseConversation = {
      serviceId: SERVICE_ID,
      orgId: org.id,
      accountId: account.id,
      created: 0,
    }

    const gemDefsResult = await batchexecute(index, token, 'CNgdBe', [100, null], org.id)
    if (!gemDefsResult || !gemDefsResult[2] || !Array.isArray(gemDefsResult[2])) {
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

    const allConversations: any[] = []
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
        } catch {
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
              allConversations.push({ ...baseConversation, ...header })
            }
          }
        } catch {
        }
      }

      cursor = result[1]
      pageCount++
      if (pageCount >= 10) break
    } while (cursor)

    return allConversations
  } catch (error) {
    logError('gemini:fetchAllGems', `Failed | error: ${JSON.stringify(error?.message || error)}`)
    return []
  }
}

export async function isOffline(accountId: string): Promise<boolean> {
  try {
    const account = await idb.accounts.get(accountId)
    if (!account) return true

    const profile = await fetchProfile(account.index)
    return !profile || profile.email !== account.email
  } catch (error: any) {
    logError('gemini:isOffline', `Error checking offline status | error: ${JSON.stringify(error?.message || error)}`)
    return true
  }
}

export async function syncMissingFromSearch(
  searchResults: any[],
  org: any,
  progressCallback?: (current: number, total: number) => void,
): Promise<any[]> {
  try {
    if (!searchResults || searchResults.length === 0) return []

    const localHeaders = await idb.headers.where('orgId').equals(org.id).toArray()
    const localIds = new Set(localHeaders.map((h: Header) => h.id))
    const missingItems = searchResults.filter((r: any) => !localIds.has(r.id))

    if (missingItems.length === 0) {
      log('gemini:syncMissingFromSearch', 'No missing conversations to sync')
      return []
    }

    log('gemini:syncMissingFromSearch', `Found ${missingItems.length} missing conversations to sync`)

    const synced: any[] = []

    for (const item of missingItems) {
      try {
        const header: Header = {
          id: item.id,
          orgId: org.id,
          accountId: org.accountId as string,
          serviceId: 'gemini',
          title: item.title,
          created: item.updated,
          updated: item.updated,
        }

        await idb.headers.put(header)
        synced.push(header)
        progressCallback?.(synced.length, missingItems.length)

        try {
          const conversation = await fetchContentInternal({ ...header, orgId: org.id, accountId: org.accountId })
          if (conversation) {
            await idb.conversations.put(conversation)
            log('gemini:syncMissingFromSearch', `Synced conversation | id: ${item.id}`)
          }
        } catch (contentError) {
          logError('gemini:syncMissingFromSearch', `Failed to fetch content | id: ${item.id} | error: ${JSON.stringify(contentError)}`)
        }
      } catch (headerError) {
        logError('gemini:syncMissingFromSearch', `Failed to save header | id: ${item.id} | error: ${JSON.stringify(headerError)}`)
        continue
      }
    }

    log('gemini:syncMissingFromSearch', `Successfully synced ${synced.length} conversations`)

    // Update org cached counts
    if (synced.length > 0) {
      try {
        await idb.orgs.updateCounts(org.id)
        log('gemini:syncMissingFromSearch', `Updated cached counts for org: ${org.id}`)
      } catch (countError) {
        logError('gemini:syncMissingFromSearch', `Failed to update counts | error: ${JSON.stringify(countError)}`)
      }
    }

    return synced
  } catch (error) {
    logError('gemini:syncMissingFromSearch', `Sync failed | error: ${JSON.stringify(error)}`)
    throw error
  }
}
