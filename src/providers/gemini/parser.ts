import { logError, logWarn } from '../../log'
import { type Header, type Message } from '../../types'

export function dataToHeader(data: any[]): any {
  try {
    const [id, title, , , , timestamp, , gemId] = data

    if (!id || !title || !timestamp) {
      logWarn('gemini:dataToHeader', `Missing required fields | id: ${id} | title: ${title} | timestamp: ${timestamp}`)
      return null
    }

    const rawTimestamp = Array.isArray(timestamp) ? timestamp[0] : timestamp
    if (rawTimestamp === undefined || rawTimestamp === null) {
      logWarn('gemini:dataToHeader', `Invalid timestamp | data: ${JSON.stringify(data)}`)
      return null
    }

    const idParts = id.split('_')
    const strippedId = idParts[1]
    if (!strippedId) {
      logWarn('gemini:dataToHeader', `Invalid conversation ID format | id: ${id}`)
      return null
    }

    const header: any = {
      id: strippedId,
      title,
      updated: rawTimestamp * 1000,
    }

    if (gemId && typeof gemId === 'string') {
      header.gemId = gemId
    }

    return header
  } catch (error) {
    logError('gemini:dataToHeader', `Failed to parse conversation data | error: ${error} | data: ${JSON.stringify(data)}`)
    return null
  }
}

export function msgToIdb(data: any[]): [Message, Message] | null {
  try {
    const [idPair, parentInfo, content, response, timestamp] = data

    if (!idPair || !content || !response || !timestamp) {
      logWarn('gemini:msgToIdb', `Skipped message with null structure | idPair: ${!!idPair} | content: ${!!content} | response: ${!!response} | timestamp: ${!!timestamp}`)
      return null
    }

    const messageId = idPair[1]
    const userContent = content[0]?.[0]
    const responseData = response[0]?.[0]
    const responseId = responseData?.[0]
    const responseText = responseData?.[1]?.[0]
    const rawTimestamp = timestamp[0]

    const parentId = parentInfo?.[1]?.includes('_') ? parentInfo[1].split('_')[1] : null
    const msgId = messageId?.includes('_') ? messageId.split('_')[1] : null
    const resId = responseId?.includes('_') ? responseId.split('_')[1] : null

    if (!msgId || !resId) {
      logWarn('gemini:msgToIdb', `Skipped malformed message | msgId: ${msgId || 'null'} | resId: ${resId || 'null'} | id: ${messageId} | resp: ${responseId}`)
      return null
    }

    const ts = rawTimestamp * 1000

    return [
      {
        id: msgId,
        parent: parentId,
        role: 'user',
        content: userContent || null,
        timestamp: ts - 3,
      },
      {
        id: resId,
        parent: msgId,
        role: 'assistant',
        content: responseText || null,
        timestamp: ts,
      },
    ]
  } catch (error: any) {
    logWarn('gemini:msgToIdb', `Failed to parse message | error: ${JSON.stringify(error?.message || error)}`)
    return null
  }
}

export function parseSearchResults(data: any): any[] {
  const results: any[] = []

  try {
    if (!data || !Array.isArray(data)) {
      return results
    }

    const rows = data[0]
    if (!Array.isArray(rows)) {
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
        logWarn('gemini:parseSearchResults', `Failed to parse search result item | error: ${error}`)
        continue
      }
    }

    return results
  } catch (error) {
    logError('gemini:parseSearchResults', `Failed to parse search results | error: ${JSON.stringify(error)}`)
    return results
  }
}
