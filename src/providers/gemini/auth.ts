import { logError, logWarn } from '../../log'
import { type AuthProfile } from '../../types'

const GEMINI_ORIGIN = 'https://gemini.google.com'

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
  } catch {
  }
}

async function persistCache(): Promise<void> {
  try {
    const obj: Record<string, unknown> = {}
    profileCache.forEach((value, key) => { obj[key] = value })
    await chrome.storage.local.set({ [STORAGE_KEY]: obj })
  } catch {
  }
}

loadPersistedCache()

export function extractQuotedValue(key: string, text: string): string | undefined {
  return text.match(RegExp(`"${key}":"([^"]+)"`))?.[1]
}

export function parseProfilePage(html: string): AuthProfile | null {
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

export function extractProfileInfo(rpcId: string, responseBody: any): AuthProfile | null {
  if (!responseBody) return null
  const data = responseBody[0]?.[0]?.[2]
  if (!data) return null
  return {
    id: data[0],
    name: data?.[2]?.[0]?.[1],
    email: data?.[9]?.[0]?.[1],
  }
}

export async function fetchProfile(userIndex: number = 0): Promise<AuthProfile | null> {
  try {
    const cached = profileCache.get(userIndex)
    if (cached && cached.token && Date.now() - cached.timestamp < 180000) {
      return { at: cached.token, id: cached.id || null, email: cached.email, name: cached.name }
    }

    const url = `${GEMINI_ORIGIN}${userIndex ? `/u/${userIndex}` : ''}/app`
    const response = await fetch(url, { method: 'GET' })
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
    } else {
      logError('gemini:fetchProfile', `No auth token extracted from profile | userIndex: ${userIndex}`)
    }

    return profile
  } catch (error) {
    logError('gemini:fetchProfile', `Failed to fetch profile | userIndex: ${userIndex} | error: ${JSON.stringify(error?.message || error)}`)
    return null
  }
}

export function clearProfileCache(): void {
  profileCache.clear()
}
