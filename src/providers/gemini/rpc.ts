import { delay, fetchServiceApi } from '../../common'
import { logError, logWarn, emitRateLimitEvent } from '../../log'
import { idb } from '../../idb'
import { syncOrchestrator } from '../../sync/SyncOrchestrator'
import { RateLimiter } from './rate-limiter'

export const GEMINI_ORIGIN = 'https://gemini.google.com'
const SERVICE_ID = 'gemini'

const rateLimiter = new RateLimiter()
const rateLimitNotificationCache = new Map<string, number>()

export class EmptyResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmptyResponseError'
  }
}

const BASE_REQUEST = {
  serviceId: SERVICE_ID,
  method: 'POST' as const,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  },
  credentials: 'include' as RequestCredentials,
}

export async function parseResponse(response: Response): Promise<any> {
  const text = await response.text()
  const url = new URL(response.url)
  const rpcids = url.searchParams.get('rpcids')

  const isSorryPage = url.pathname.includes('/sorry/') || url.pathname.includes('/sorry') ||
    url.href.includes('/sorry/index') ||
    text.includes('www.google.com/sorry/') || text.includes('sorry/index') ||
    text.includes('captcha') ||
    (response.status === 200 && url.hostname.includes('google.com') && text.length < 1000 && !text.includes(rpcids!))

  if (isSorryPage) {
    logError('gemini:parser', `Google rate limit/CAPTCHA detected | url: ${url.href} | status: ${response.status} | textLength: ${text.length}`)

    await idb.services.update(SERVICE_ID, { isRateLimited: true })
    emitRateLimitEvent(SERVICE_ID, true)

    const lastNotif = rateLimitNotificationCache.get(SERVICE_ID) || 0
    if (Date.now() - lastNotif > 300000) {
      rateLimitNotificationCache.set(SERVICE_ID, Date.now())
    }

    // Use alarm-backed rate limit reset (survives SW termination) — fix M4
    await syncOrchestrator.setRateLimit(SERVICE_ID, 5)

    const error = new Error('Gemini rate limit detected (Google sorry page)') as any
    error.status = 429
    error.response = { status: 429 }
    throw error
  }

  if (text.includes(`"${rpcids}",null,null,null,`) && text.includes(',"generic"')) {
    throw new EmptyResponseError(`Empty response for RPC ID: ${rpcids}`)
  }

  const parsed = getData(rpcids!, text)
  if (!parsed) {
    logWarn('gemini:parser', `Failed to parse response | rpcids: ${rpcids} | responseLength: ${text.length}`)
  }
  return parsed
}

function getData(key: string, text: string): any {
  try {
    const keyIndex = text.indexOf(key)
    if (keyIndex === -1) {
      logError('gemini:getData', `Key not found in response | key: ${key} | textLength: ${text.length}`)
      return null
    }

    const start = keyIndex + key.length + 2
    const end = text.lastIndexOf(',null,null,null,"generic"')

    if (end === -1) {
      logError('gemini:getData', `End marker not found | key: ${key} | textLength: ${text.length}`)
      return null
    }
    if (start >= end) {
      logError('gemini:getData', `Invalid slice indices | key: ${key} | start: ${start} | end: ${end}`)
      return null
    }

    const slice = text.slice(start, end)
    const outerParsed = JSON.parse(slice)
    const innerParsed = JSON.parse(outerParsed)

    if (innerParsed && typeof innerParsed === 'object' && !Array.isArray(innerParsed)) {
      const keys = Object.keys(innerParsed)
      logError('gemini:getData', `Unexpected object structure | keys: ${keys.join(', ')}`)
    }

    return innerParsed
  } catch (error: any) {
    logError('gemini:getData', `Parse failed | key: ${key} | error: ${JSON.stringify(error?.message || error)}`)
    return null
  }
}

export async function batchexecute(
  index: number,
  token: string,
  rpcId: string,
  args: any[],
  orgId: string,
): Promise<any> {
  try {
    await rateLimiter.throttle()

    const service = await idb.services.get(SERVICE_ID)
    if (service?.isRateLimited) {
      await delay(5000)
    }

    if (!token || token === 'undefined' || token === 'null' || typeof token !== 'string') {
      logError('gemini:rpc', `Invalid token for RPC call | token: ${token} | type: ${typeof token}`)
      throw new Error(`Invalid token for RPC call: ${token}`)
    }

    if (index !== undefined && (typeof index !== 'number' || index < 0)) {
      logError('gemini:rpc', `Invalid index for RPC call | index: ${index} | type: ${typeof index}`)
      throw new Error(`Invalid index for RPC call: ${index}`)
    }

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
      reqLength: args.length,
    }
    logError('gemini:rpc', `RPC failed | ${JSON.stringify(context)}`)
    throw error
  }
}

export async function parseStreamResponse(response: Response): Promise<{ id?: string; response: string }> {
  const text = await response.text()

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

        if (!conversationId) {
          const idCandidate = inner[1]?.[0]?.split('_')[1]
          if (idCandidate) conversationId = idCandidate
        }

        const responseBlock = inner[4]?.[0]?.[1]?.[0]
        if (responseBlock && typeof responseBlock === 'string' && responseBlock.length > 10) {
          responseContent = responseBlock
          break
        }

        if (!responseContent) {
          const altBlock = inner[4]?.[0]?.[0]
          if (altBlock && typeof altBlock === 'string' && altBlock.length > 10) {
            responseContent = altBlock
          }
        }
      } catch (parseError: any) {
        logWarn('gemini:rpc', `parseStreamResponse: skipping unparseable entry | ${parseError?.message || parseError}`)
        continue
      }
    }
  }

  if (!responseContent) {
    throw new Error('Failed to parse Gemini response: no response content found')
  }

  return { id: conversationId, response: responseContent }
}
