import { logError, logWarn } from '../../log'
import { type AuthProfile } from '../../types'
import { TokenVault } from '../../accounts/TokenVault'

const GEMINI_ORIGIN = 'https://gemini.google.com'

/** Profile cache TTL in milliseconds. Set to override default (3 minutes). Defaults to 180000. */
export let profileCacheTTL = 180_000

const profileCache = new Map<number, { token: string; timestamp: number; id: string | null; email?: string; name?: string }>()
const STORAGE_KEY = 'gemini_profile_cache'

async function loadPersistedCache(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY)
    const persisted = data[STORAGE_KEY]
    if (persisted && typeof persisted === 'object') {
      for (const [key, value] of Object.entries(persisted)) {
        profileCache.set(Number(key), value as any)
      }
    }
  } catch (error) {
    logError('auth:loadPersistedCache', 'Failed to load profile cache', error)
  }
}

async function persistCache(): Promise<void> {
  try {
    const obj: Record<string, unknown> = {}
    profileCache.forEach((value, key) => { obj[key] = value })
    await chrome.storage.local.set({ [STORAGE_KEY]: obj })
  } catch (error) {
    logError('auth:persistCache', 'Failed to persist profile cache', error)
  }
}

loadPersistedCache()

export function extractQuotedValue(key: string, text: string): string | undefined {
  return text.match(RegExp(`"${key}":"([^"]+)"`))?.[1]
}

export function parseProfilePage(html: string): AuthProfile | null {
  // Extract SNlM0e (auth token) - try JSON first, fallback to regex
  let at: string | undefined
  try {
    at = extractQuotedValue('SNlM0e', html)
  } catch {
    logWarn('gemini:auth', 'Failed to extract SNlM0e via first method, trying fallbacks')
    at = undefined
  }

  // FIX: Additional fallback patterns for token extraction
  if (!at) {
    // Pattern 1: Token-like string (alphanumeric with colon-separated timestamp)
    at = html.match(/[a-zA-Z0-9_-]{26,30}:[0-9]{13,}/)?.[0]
  }
  if (!at) {
    // Pattern 2: Look for at= or "at":" in inline scripts
    at = html.match(/["']at["']\s*:\s*["']([a-zA-Z0-9_-]{20,})["']/)?.[1]
  }
  if (!at) {
    // Pattern 3: Look for token in wrb.fr data blocks
    at = html.match(/"wrb\.fr"[^"]*"[a-zA-Z0-9_-]{20,}:[0-9]{13,}/)?.[0]?.match(/[a-zA-Z0-9_-]{26,30}:[0-9]{13,}/)?.[0]
  }

  // Extract user ID
  let id: string | undefined
  try {
    id = extractQuotedValue('S06Grb', html)
  } catch {
    logWarn('gemini:auth', 'Failed to extract S06Grb via first method, trying fallbacks')
    id = undefined
  }
  if (!id) {
    // Fallback: look for user ID in other patterns
    id = html.match(/"S06Grb"\s*:\s*"([^"]+)"/)?.[1]
  }

  // Extract name and email
  const nameMatch = html.match(/:\s+([^:]+)\s+&#10;\(([^)]+)\)"/)
  if (nameMatch) {
    return { id: id || null, at: at || null, name: nameMatch[1].trim(), email: nameMatch[2] }
  }

  // FIX: Fallback email extraction from meta tags or script data
  const emailMatch = html.match(/["']email["']\s*:\s*["']([^"']+)["']/)
  if (emailMatch) {
    return { id: id || null, at: at || null, email: emailMatch[1] }
  }

  return { id: id || null, at: at || null }
}

export function extractProfileInfo(rpcId: string, responseBody: any): AuthProfile | null {
  if (!responseBody) return null
  const data = responseBody[0]?.[0]?.[2]
  if (!data) return null
  return {
    id: data[0],
    at: null,
    name: data?.[2]?.[0]?.[1],
    email: data?.[9]?.[0]?.[1],
  }
}

export async function fetchProfile(userIndex: number = 0): Promise<AuthProfile | null> {
  try {
    const cached = profileCache.get(userIndex)
    if (cached && cached.token && Date.now() - cached.timestamp < profileCacheTTL) {
      return { at: cached.token, id: cached.id || null, email: cached.email, name: cached.name }
    }

    const url = `${GEMINI_ORIGIN}${userIndex ? `/u/${userIndex}` : ''}/app`
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000), // fix L2
    })
    if (!response.ok) {
      logWarn('gemini:fetchProfile', `HTTP error | status: ${response.status}`)
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
      persistCache()
      // Token is stored via TokenVault.setToken() by the caller
    } else {
      logError('gemini:fetchProfile', `No auth token extracted from profile | userIndex: ${userIndex}`)
    }

    return profile
  } catch (error: any) {
    logError('gemini:fetchProfile', `Failed to fetch profile | userIndex: ${userIndex} | error: ${JSON.stringify(error?.message || error)}`)
    return null
  }
}

export function clearProfileCache(): void {
  profileCache.clear()
}
