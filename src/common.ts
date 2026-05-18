import { logError } from './log'

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function captureException(error: any): void {
  logError('captureException', error?.message || error)
}

export interface FetchServiceApiOptions {
  method: string
  headers: Record<string, string>
  credentials: RequestCredentials
  body?: URLSearchParams
  parser?: (response: Response) => Promise<any>
  query?: Record<string, string>
  orgId?: string
  signal?: AbortSignal
}

export async function fetchServiceApi(
  url: string,
  options: FetchServiceApiOptions,
): Promise<any> {
  const { parser, query, body, ...fetchOptions } = options

  // Append query params if provided
  let finalUrl = url
  if (query) {
    const params = new URLSearchParams(query)
    finalUrl += (url.includes('?') ? '&' : '?') + params.toString()
  }

  try {
    const response = await fetch(finalUrl, {
      ...fetchOptions,
      body: body?.toString(),
    })

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`) as any
      error.status = response.status
      error.response = { status: response.status }
      throw error
    }

    if (parser) {
      const parsed = await parser(response)
      return { parsed }
    }

    return { parsed: await response.json() }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error
    }
    if (error.status) {
      throw error
    }
    // Network error
    return { networkError: true, offline: true }
  }
}

// makeSumarizationFunction removed - dead code
