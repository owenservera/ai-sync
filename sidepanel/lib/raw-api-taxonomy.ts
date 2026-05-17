/**
 * Gemini Raw API Deobfuscation Test
 * 
 * Systematically maps every field position in the batchexecute response
 * by analyzing the raw data structure and producing a complete taxonomy.
 * 
 * Usage: Run from the sidepanel CapabilitiesPanel as a new test capability.
 */

// ============================================================================
// TOP-LEVEL RESPONSE STRUCTURE
// ============================================================================
// The batchexecute response for RPC 'hNvQHb' returns:
//   [
//     [ [message1], [message2], ... ],  // [0] = messages array
//     cursor,                            // [1] = pagination cursor (null or array)
//     responseMetadata                   // [2] = response metadata / config
//   ]

// ============================================================================
// MESSAGE STRUCTURE (each element in result[0])
// ============================================================================
// A message tuple has 5 top-level positions:
//   [
//     idPair,       // [0] = [conversationId, messageId]
//     parentInfo,   // [1] = [?, parentId]
//     content,      // [2] = user message content
//     response,     // [3] = assistant response data
//     timestamp     // [4] = [seconds, nanoseconds]
//   ]

// ============================================================================
// RESPONSE STRUCTURE (message[3] - the assistant response)
// ============================================================================
// The response is the most complex part. Structure:
//   response[0] = primary response block
//     response[0][0] = response data tuple
//       response[0][0][0] = responseId
//       response[0][0][1] = [responseText, ...parts]
//       response[0][0][2] = prompt preview
//       response[0][0][3] = full prompt text
//     response[0][1] = tool call states (array of tool execution traces)
//     response[0][2] = tool results
//     response[0][3] = ?
//     response[0][4] = ?
//     response[0][5] = locale (e.g., "ES", "en")
//     response[0][6] = isComplete (boolean)
//     response[0][7] = isStreaming (boolean)
//     response[0][8] = ?
//     response[0][9] = ?
//     response[0][10] = ?
//     response[0][11] = ?
//     response[0][12] = usage stats array [?, ?, ?]
//     response[0][13] = conversation hash/id string
//     response[0][14] = ?
//     response[0][15] = conversation hash/id (may differ from [13])
//     response[0][16] = ?
//     response[0][17] = ?
//     response[0][18] = ?
//     response[0][19] = model name (e.g., "Nano Banana 2", "Veo 3.1 Lite")
//     response[0][20] = ?
//     response[0][21] = ?
//     response[0][22] = model version number
//
//   response[1] = tool state snapshots (array)
//   response[2] = tool results snapshot
//   response[3] = ?
//   response[4] = ?
//   response[5] = locale
//   response[6] = isComplete
//   response[7] = isStreaming
//   response[8] = ?
//   response[9] = ?
//   response[10] = ?
//   response[11] = ?
//   response[12] = usage stats
//   response[13] = conversation hash
//   response[14] = ?
//   response[15] = safety/classifier results
//   response[16] = conversation hash
//   response[17] = ?
//   response[18] = ?
//   response[19] = ?
//   response[20] = model name (duplicate of [19])
//   response[21] = ?
//   response[22] = model version (duplicate of [22])

// ============================================================================
// RESPONSE METADATA (result[2])
// ============================================================================
// Contains generated media metadata and safety classifier results:
//   result[2][0][0][0][0] = array of response config objects
//     Each config:
//       config[0] = image/video metadata
//         [0] = null
//         [1] = index
//         [2] = filename
//         [3] = thumbnailUrl
//         [4] = null
//         [5] = base64 data
//         [6] = null
//         [7] = null
//         [8] = null
//         [9] = [timestamp, nanos]
//         [10] = null
//         [11] = mimeType
//         [12] = null
//         [13] = null
//         [14] = null
//         [15] = [width, height, fileSize] for images
//              = [[duration, nanos], width, height] for videos
//       config[1] = prompt info [url, ?, promptText]
//       config[2] = null
//       config[3] = settings [model, promptText, ..., safetyFilter, ?, complaintFlow]
//     result[2][0][0][0][1] = null
//     result[2][0][0][0][2] = [true]
//   result[2][0][0][1] = safety classifier results (pre-generation)
//   result[2][0][0][2] = safety classifier results (post-generation)

// ============================================================================
// SAFETY CLASSIFIER STRUCTURE
// ============================================================================
// Each classifier entry:
//   [
//     classifierName,           // [0] = string name
//     results,                  // [1] = array of [label, score] or [label, ?, score]
//     resultType,               // [2] = string type name
//     numericId                 // [3] = string numeric ID
//   ]

// ============================================================================
// TOOL CALL STRUCTURE (within response[0][1])
// ============================================================================
// Each tool call:
//   [
//     toolId,                   // [0] = null or string
//     toolInfo,                 // [1] = [toolName, toolStatus, statusMessage, statusDetail]
//     toolState,                // [2] = state object
//     toolResult                // [3] = result object
//   ]

// ============================================================================
// KNOWN RPC IDs
// ============================================================================
// hNvQHb = fetch conversation content
// unqWSc = search conversations
// MUAZcd = edit conversation title
// GzXR5e = delete conversation
// (others discovered in createConversationInternal, fetchSummaryInternal, etc.)

export interface DeobfuscationResult {
  taxonomy: Record<string, FieldDescription>
  unknowns: Array<{ path: string; value: any; context: string }>
  confirmed: Array<{ path: string; name: string; confidence: 'high' | 'medium' | 'low' }>
}

export interface FieldDescription {
  path: string
  name: string
  type: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

/**
 * Analyzes a raw API response and produces a deobfuscation report.
 * This is designed to be called from the CapabilitiesPanel test.
 */
export function deobfuscateRawResponse(raw: any): DeobfuscationResult {
  if (!raw || typeof raw !== 'object' || raw.error) {
    return { taxonomy: {}, unknowns: [], confirmed: [] }
  }

  const taxonomy: Record<string, FieldDescription> = {}
  const unknowns: Array<{ path: string; value: any; context: string }> = []
  const confirmed: Array<{ path: string; name: string; confidence: 'high' | 'medium' | 'low' }> = []

  // Top-level structure
  if (Array.isArray(raw[0])) {
    taxonomy['[0]'] = { path: '[0]', name: 'messages', type: 'array', confidence: 'high', notes: 'Array of message tuples' }
    confirmed.push({ path: '[0]', name: 'messages', confidence: 'high' })
  }
  if (raw[1] !== undefined) {
    taxonomy['[1]'] = { path: '[1]', name: 'paginationCursor', type: typeof raw[1], confidence: 'high', notes: 'Null or cursor array for next page' }
    confirmed.push({ path: '[1]', name: 'paginationCursor', confidence: 'high' })
  }
  if (raw[2] !== undefined) {
    taxonomy['[2]'] = { path: '[2]', name: 'responseMetadata', type: typeof raw[2], confidence: 'high', notes: 'Contains media metadata and safety classifier results' }
    confirmed.push({ path: '[2]', name: 'responseMetadata', confidence: 'high' })
  }

  // Analyze each message
  const messages = raw[0] || []
  messages.forEach((msg: any, msgIdx: number) => {
    const prefix = `[0][${msgIdx}]`
    if (!Array.isArray(msg) || msg.length < 5) return

    // Message top-level
    const [idPair, parentInfo, content, response, timestamp] = msg

    taxonomy[`${prefix}[0]`] = { path: `${prefix}[0]`, name: 'idPair', type: 'array', confidence: 'high', notes: '[conversationId, messageId]' }
    taxonomy[`${prefix}[1]`] = { path: `${prefix}[1]`, name: 'parentInfo', type: 'array', confidence: 'high', notes: '[?, parentId]' }
    taxonomy[`${prefix}[2]`] = { path: `${prefix}[2]`, name: 'userContent', type: 'array', confidence: 'high', notes: '[[userText]]' }
    taxonomy[`${prefix}[3]`] = { path: `${prefix}[3]`, name: 'assistantResponse', type: 'array', confidence: 'high', notes: 'Complex response structure' }
    taxonomy[`${prefix}[4]`] = { path: `${prefix}[4]`, name: 'timestamp', type: 'array', confidence: 'high', notes: '[seconds, nanoseconds]' }

    // Response structure analysis
    if (Array.isArray(response)) {
      analyzeResponseStructure(response, `${prefix}[3]`, taxonomy, unknowns, confirmed)
    }
  })

  // Analyze response metadata
  if (raw[2]) {
    analyzeResponseMetadata(raw[2], '[2]', taxonomy, unknowns, confirmed)
  }

  return { taxonomy, unknowns, confirmed }
}

function analyzeResponseStructure(
  response: any[],
  prefix: string,
  taxonomy: Record<string, FieldDescription>,
  unknowns: Array<{ path: string; value: any; context: string }>,
  confirmed: Array<{ path: string; name: string; confidence: 'high' | 'medium' | 'low' }>,
) {
  const primaryBlock = response[0]

  // Level 1: Nested inside primaryBlock (response[0])
  if (primaryBlock && Array.isArray(primaryBlock[0])) {
    const respData = primaryBlock[0]
    taxonomy[`${prefix}[0][0][0]`] = { path: `${prefix}[0][0][0]`, name: 'responseId', type: 'string', confidence: 'high' }
    taxonomy[`${prefix}[0][0][1]`] = { path: `${prefix}[0][0][1]`, name: 'responseContent', type: 'array', confidence: 'high', notes: '[responseText, ...additionalParts]' }
    taxonomy[`${prefix}[0][0][2]`] = { path: `${prefix}[0][0][2]`, name: 'promptPreview', type: 'string|null', confidence: 'medium' }
    taxonomy[`${prefix}[0][0][3]`] = { path: `${prefix}[0][0][3]`, name: 'promptFull', type: 'string|null', confidence: 'medium' }
  }
  if (primaryBlock?.[1]) {
    taxonomy[`${prefix}[0][1]`] = { path: `${prefix}[0][1]`, name: 'toolCalls', type: 'array', confidence: 'high', notes: 'Array of tool execution traces' }
  }
  if (primaryBlock?.[2]) {
    taxonomy[`${prefix}[0][2]`] = { path: `${prefix}[0][2]`, name: 'toolResults', type: 'any', confidence: 'medium' }
  }

  // Level 1 known fields (inside primaryBlock)
  const primaryKnownFields: Record<number, { name: string; type: string; confidence: 'high' | 'medium' | 'low'; notes?: string }> = {
    5: { name: 'locale', type: 'string', confidence: 'high' },
    6: { name: 'isComplete', type: 'boolean', confidence: 'high' },
    7: { name: 'isStreaming', type: 'boolean', confidence: 'medium' },
    12: { name: 'usageStats', type: 'array', confidence: 'medium', notes: '[inputTokens, outputTokens, totalTokens] or similar' },
    13: { name: 'conversationHash1', type: 'string', confidence: 'medium' },
    15: { name: 'conversationHash2', type: 'string', confidence: 'medium' },
    19: { name: 'modelName', type: 'string', confidence: 'high' },
    22: { name: 'modelVersion', type: 'number', confidence: 'high' },
  }

  for (const [idx, info] of Object.entries(primaryKnownFields)) {
    const i = parseInt(idx)
    const val = primaryBlock?.[i]
    if (val !== undefined && val !== null) {
      taxonomy[`${prefix}[0][${i}]`] = {
        path: `${prefix}[0][${i}]`,
        name: info.name,
        type: info.type,
        confidence: info.confidence,
        notes: info.notes || `Value: ${JSON.stringify(val).slice(0, 100)}`,
      }
      confirmed.push({ path: `${prefix}[0][${i}]`, name: info.name, confidence: info.confidence })
    }
  }

  // Level 2: Flat duplicates at response top-level
  const topLevelKnownFields: Record<number, { name: string; type: string; confidence: 'high' | 'medium' | 'low'; notes?: string }> = {
    1: { name: 'toolStateSnapshots', type: 'array', confidence: 'medium' },
    2: { name: 'toolResultsSnapshot', type: 'any', confidence: 'medium' },
    3: { name: 'responseId', type: 'string', confidence: 'high', notes: 'Duplicate of [0][0][0]' },
    4: { name: 'toolCalls', type: 'array', confidence: 'high', notes: 'Duplicate of [0][1]' },
    5: { name: 'toolResults', type: 'any', confidence: 'medium', notes: 'Duplicate of [0][2]' },
    8: { name: 'locale', type: 'string', confidence: 'high', notes: 'Duplicate of [0][5]' },
    9: { name: 'isComplete', type: 'boolean', confidence: 'high', notes: 'Duplicate of [0][6]' },
    10: { name: 'isStreaming', type: 'boolean', confidence: 'medium', notes: 'Duplicate of [0][7]' },
    14: { name: 'conversationHash1', type: 'string', confidence: 'medium' },
    17: { name: 'conversationHash2', type: 'string', confidence: 'medium' },
    21: { name: 'modelName', type: 'string', confidence: 'high', notes: 'Duplicate of [0][19]' },
    24: { name: 'modelVersion', type: 'number', confidence: 'high', notes: 'Duplicate of [0][22]' },
  }

  for (const [idx, info] of Object.entries(topLevelKnownFields)) {
    const i = parseInt(idx)
    const val = response[i]
    if (val !== undefined && val !== null) {
      taxonomy[`${prefix}[${i}]`] = {
        path: `${prefix}[${i}]`,
        name: info.name,
        type: info.type,
        confidence: info.confidence,
        notes: info.notes || `Value: ${JSON.stringify(val).slice(0, 100)}`,
      }
      confirmed.push({ path: `${prefix}[${i}]`, name: info.name, confidence: info.confidence })
    }
  }

  // Unknown fields — check both levels
  const primarySkip = new Set([0, 1, 2, ...Object.keys(primaryKnownFields).map(Number)])
  for (let i = 0; i < (primaryBlock?.length || 0); i++) {
    if (!primarySkip.has(i)) {
      const val = primaryBlock[i]
      if (val !== null && val !== undefined) {
        unknowns.push({
          path: `${prefix}[0][${i}]`,
          value: typeof val === 'object' ? JSON.stringify(val).slice(0, 200) : val,
          context: `Type: ${Array.isArray(val) ? 'array' : typeof val}, Length: ${Array.isArray(val) ? val.length : 'N/A'}`,
        })
      }
    }
  }

  const topLevelSkip = new Set([0, 1, 2, ...Object.keys(topLevelKnownFields).map(Number)])
  for (let i = 0; i < response.length; i++) {
    if (!topLevelSkip.has(i)) {
      const val = response[i]
      if (val !== null && val !== undefined) {
        unknowns.push({
          path: `${prefix}[${i}]`,
          value: typeof val === 'object' ? JSON.stringify(val).slice(0, 200) : val,
          context: `Type: ${Array.isArray(val) ? 'array' : typeof val}, Length: ${Array.isArray(val) ? val.length : 'N/A'}`,
        })
      }
    }
  }
}

function analyzeResponseMetadata(
  metadata: any,
  prefix: string,
  taxonomy: Record<string, FieldDescription>,
  unknowns: Array<{ path: string; value: any; context: string }>,
  confirmed: Array<{ path: string; name: string; confidence: 'high' | 'medium' | 'low' }>,
) {
  // Media configs
  const configs = metadata?.[0]?.[0]?.[0]?.[0]
  if (Array.isArray(configs)) {
    taxonomy[`${prefix}[0][0][0][0]`] = {
      path: `${prefix}[0][0][0][0]`,
      name: 'responseConfigs',
      type: 'array',
      confidence: 'high',
      notes: `Contains ${configs.length} config objects (media metadata, prompts, settings)`,
    }

    configs.forEach((config: any, idx: number) => {
      const configPrefix = `${prefix}[0][0][0][0][${idx}]`

      if (config[0]) {
        const media = config[0]
        const isVideo = media[11]?.includes('video') || media[2]?.includes('video')
        taxonomy[`${configPrefix}[0]`] = {
          path: `${configPrefix}[0]`,
          name: isVideo ? 'videoMetadata' : 'imageMetadata',
          type: 'array',
          confidence: 'high',
          notes: isVideo
            ? '[?, index, filename, thumbnail, ?, base64, ?, downloadUrls, ?, [timestamp, nanos], ?, mimeType, ?, ?, ?, [[duration, nanos], width, height]]'
            : '[?, index, filename, thumbnail, ?, base64, ?, ?, ?, [timestamp, nanos], ?, mimeType, ?, ?, ?, [width, height, fileSize]]',
        }
      }

      if (config[1]) {
        taxonomy[`${configPrefix}[1]`] = {
          path: `${configPrefix}[1]`,
          name: 'promptInfo',
          type: 'array',
          confidence: 'medium',
          notes: '[promptUrl, ?, promptText]',
        }
      }

      if (config[3]) {
        taxonomy[`${configPrefix}[3]`] = {
          path: `${configPrefix}[3]`,
          name: 'generationSettings',
          type: 'array',
          confidence: 'high',
          notes: '[model, promptText, ..., safetyFilter, ?, complaintFlow]',
        }
      }
    })
  }

  // Safety classifier results
  const preClassifiers = metadata?.[0]?.[0]?.[1]
  const postClassifiers = metadata?.[0]?.[0]?.[2]

  if (preClassifiers) {
    taxonomy[`${prefix}[0][0][1]`] = {
      path: `${prefix}[0][0][1]`,
      name: 'preGenerationSafetyClassifiers',
      type: 'array',
      confidence: 'high',
      notes: 'Safety checks run before generation',
    }
    extractClassifierNames(preClassifiers, `${prefix}[0][0][1]`, taxonomy, confirmed)
  }

  if (postClassifiers) {
    taxonomy[`${prefix}[0][0][2]`] = {
      path: `${prefix}[0][0][2]`,
      name: 'postGenerationSafetyClassifiers',
      type: 'array',
      confidence: 'high',
      notes: 'Safety checks run after generation',
    }
    extractClassifierNames(postClassifiers, `${prefix}[0][0][2]`, taxonomy, confirmed)
  }
}

function extractClassifierNames(
  classifiers: any,
  prefix: string,
  taxonomy: Record<string, FieldDescription>,
  confirmed: Array<{ path: string; name: string; confidence: 'high' | 'medium' | 'low' }>,
) {
  if (!Array.isArray(classifiers)) return

  classifiers.forEach((group: any, groupIdx: number) => {
    if (!Array.isArray(group)) return
    group.forEach((classifier: any, idx: number) => {
      if (Array.isArray(classifier) && typeof classifier[0] === 'string') {
        const name = classifier[0]
        taxonomy[`${prefix}[${groupIdx}][${idx}][0]`] = {
          path: `${prefix}[${groupIdx}][${idx}][0]`,
          name: `classifier_${name}`,
          type: 'object',
          confidence: 'high',
          notes: name,
        }
        confirmed.push({ path: `${prefix}[${groupIdx}][${idx}]`, name, confidence: 'high' })
      }
    })
  })
}
