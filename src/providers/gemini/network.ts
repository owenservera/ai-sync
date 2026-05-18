import { log, logError, logWarn } from '../../log'
import { idb } from '../../idb'
import { delay } from '../../common'
import { LiveStorage } from '../../LiveStorage'
import { TokenVault } from '../../accounts/TokenVault'
import { type RequestDetails, type SyncTrigger, type Account, type Org, OrgStatus } from '../../types'
import { extractProfileInfo, fetchProfile } from './auth'

const SERVICE_ID = 'gemini'
const GEMINI_DOMAIN = 'gemini.google.com'
const syncThrottleCache = new Map<string, number>()

export async function onGoogleAccountFetch(email: string): Promise<void> {
  const cookie = await new Promise<chrome.cookies.Cookie | null>(resolve => {
    chrome.cookies.get({ url: 'https://gemini.google.com', name: 'SID' }, resolve)
  })
  const sid = cookie?.value

  if (!sid) return

  const duplicate = await (idb.accounts as any).findDuplicate(email, SERVICE_ID)

  if (duplicate) {
    if (duplicate.id !== sid) {
      const oldOrg = await idb.orgs.get(duplicate.id)
      if (oldOrg) {
        await idb.orgs.delete(duplicate.id)
        await idb.orgs.put({ ...oldOrg, id: sid, accountId: sid } as any)
      }
      await idb.accounts.delete(duplicate.id)
      await idb.accounts.put({ ...duplicate, id: sid, index: 0, token: '' } as any)
    }

    return
  }

  const account = await (idb.accounts as any).createOrUpdate({
    serviceId: SERVICE_ID,
    id: sid,
    index: 0,
    token: '',
    email: email,
    name: email,
  })

  const existingOrg = await idb.orgs.get(account.id)
  if (!existingOrg) {
    await idb.orgs.put({
      serviceId: SERVICE_ID,
      accountId: account.id,
      email: account.email,
      name: account.name || email,
      id: account.id,
      status: OrgStatus.New,
    } as any)
  }
}

export async function handleNetworkActivity(details: RequestDetails): Promise<SyncTrigger | null> {
  const url = details.url
  if (!url?.includes(GEMINI_DOMAIN)) return null

  const userIndex = parseInt(new URL(url).pathname.match(/\/u\/(\d+)/)?.[1] || '0', 10)

  const bodyParams = new URLSearchParams(details.request.body)
  const at = bodyParams.get('at')

  // FIX: Get SID cookie for consistent account ID scheme
  const sidCookie = await new Promise<chrome.cookies.Cookie | null>(resolve =>
    chrome.cookies.get({ url: 'https://gemini.google.com', name: 'SID' }, resolve)
  )
  const sidAccountId = sidCookie?.value
    ? `${sidCookie.value}${userIndex > 0 ? `_${userIndex}` : ''}`
    : null

  if (at) {
    // FIX: Use TokenVault instead of writing tokens to IDB
    if (sidAccountId) {
      const account = await idb.accounts.get(sidAccountId)
      if (account) {
        await TokenVault.setToken(account.id, at)
      }
    } else {
      const tokenlessAccounts = await idb.accounts
        .filter((a: any) => a.serviceId === SERVICE_ID && !a.token)
        .toArray()
      for (const acc of tokenlessAccounts) {
        await TokenVault.setToken(acc.id, at)
      }
    }
  }

  const rpcids = new URL(url).searchParams.get('rpcids')

  if (rpcids === 'MaZiqc' && details.response?.body) {
    try {
      const body = details.response.body
      if (Array.isArray(body) && body[2]) {
        let conversations: any[] = []
        if (typeof body[2] === 'string') {
          try {
            const parsed = JSON.parse(body[2])
            conversations = Array.isArray(parsed) ? parsed[2] || parsed : []
          } catch (parseError: any) {
            logWarn('gemini:network', `Failed to parse conversation list body | ${parseError?.message || parseError}`)
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
      logError('gemini:onFetch', `Failed to cache Gem conversations: ${error}`)
    }
  }

  const isStreamRequest = url.includes('StreamGenerate') || url.includes('assistant.lamda')

  const bodyStr = typeof details.request.body === 'string' ? details.request.body : ''
  const hasGemRef = url.includes('/gem/') || url.includes('gems') ||
    bodyStr.includes('gem_') || bodyStr.includes('"gem"') ||
    bodyStr.includes('custom_assistant')

  const pathname = new URL(url).pathname
  const isAppConversation = /\/app\/[a-f0-9]/.test(pathname) ||
    /\bc_[a-f0-9]{10,}/.test(bodyStr) ||
    hasGemRef

  const modifyingRPCs = ['MUAZcd', 'GzXR5e', 'PCck7e', 'qWymEb', 'CNgdBe', 'HcT8bb']
  const shouldSync = modifyingRPCs.includes(rpcids!) || isStreamRequest ||
    (isAppConversation && details.request.method === 'POST' && !!at)

  if (!shouldSync) {
    if (rpcids !== 'o30O0e' || !at) return null

    const profile = extractProfileInfo(rpcids, details.response?.body)
    if (!profile) return null

    // FIX: Use SID-based account ID for consistency with detectAccounts()
    if (!sidAccountId) return null

    let existingAccount = await idb.accounts.get(sidAccountId)
    if (!profile.email && existingAccount?.email) {
      profile.email = existingAccount.email
    }
    if (!profile?.email) {
      profile.email = (await fetchProfile(userIndex))?.email
    }

    // Update account with latest token and metadata
    if (existingAccount) {
      await idb.accounts.update(existingAccount.id, {
        index: userIndex,
        email: profile.email || existingAccount.email,
        name: profile.name || existingAccount.name,
      })
      if (at) {
        await TokenVault.setToken(existingAccount.id, at)
      }
    } else if (profile.email) {
      // FIX: Create with SID-based ID, not profile.id
      await idb.accounts.put({
        id: sidAccountId,
        serviceId: SERVICE_ID,
        index: userIndex,
        token: at,
        email: profile.email,
        name: profile.name || profile.email,
      } as any)
    }

    await idb.services.put({
      id: SERVICE_ID,
      current: {
        accountId: sidAccountId,
        email: profile.email ?? '',
        token: at,
      },
    })

    const existingOrg = await idb.orgs.get(sidAccountId)
    if (!existingOrg && profile.email) {
      const orgByEmail = await idb.orgs
        .filter((o: any) => o.email === profile.email && o.serviceId === SERVICE_ID)
        .first()
      if (!orgByEmail) {
        await idb.orgs.put({
          serviceId: SERVICE_ID,
          accountId: sidAccountId,
          id: sidAccountId,
          email: profile.email,
          name: profile.name || profile.email,
          status: OrgStatus.New,
        } as any)
      }
    }

    return null
  }

  // Check manual sync setting — skip auto-trigger if manual mode is enabled
  const { settings } = await LiveStorage.get({
    settings: { general: { manualSync: LiveStorage.defaultValue } },
  })
  if (settings.general.manualSync) return null

  const accounts = await idb.accounts
    .filter((a: any) => a.serviceId === SERVICE_ID)
    .toArray()
  const matchingAccount = accounts.find((a: any) => a.token === at)
  if (!matchingAccount) return null

  const org = await idb.orgs.get(matchingAccount.id)
  if (!org || org.status === OrgStatus.Inactive) return null

  const now = Date.now()
  const lastSync = syncThrottleCache.get(org.id) || 0
  if (now - lastSync < 5000) {
    log('gemini:onFetch', `Skipping redundant sync | rpcids: ${rpcids} | orgId: ${org.id} | lastSyncAgo: ${now - lastSync}ms`)
    return null
  }

  // PCck7e (summary) and stream requests need 1s delay before triggering
  if (rpcids === 'PCck7e' || isStreamRequest) {
    await delay(1000)
  }

  // Throttle is now managed by SyncOrchestrator — this function only returns the trigger
  if (rpcids !== 'PCck7e') {
    syncThrottleCache.set(org.id, Date.now())
  }

  return {
    providerId: SERVICE_ID,
    type: modifyingRPCs.includes(rpcids!) ? 'modify' : isStreamRequest ? 'stream' : 'view',
  }
}
