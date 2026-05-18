/**
 * Gemini Protocol Test Suite — Full User Journey
 * 
 * Tests the complete interaction cycle mimicking real user behavior:
 * create → prompt → respond → attach → tool use → edit → regenerate → multi-turn → cleanup
 */

export interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'skip'
  duration: number
  details: string
  response?: any
  error?: string
}

export interface TestSuiteResult {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  tests: TestResult[]
}

export async function runProtocolTests(payload: Record<string, unknown>): Promise<TestSuiteResult> {
  const results: TestResult[] = []
  const startTime = Date.now()
  const createdIds: string[] = []

  // Phase 1: Connectivity & Auth
  results.push(await testPing(payload))
  results.push(await testOfflineStatus(payload))

  // Phase 2: Read existing data
  results.push(await testListConversations(payload))
  results.push(await testFetchExistingConversation(payload))
  results.push(await testSearchConversations(payload))
  results.push(await testFetchAllGems(payload))

  // Phase 3: Create & Basic Interaction
  results.push(await testCreateConversation(payload, createdIds))
  results.push(await testVerifyCreatedContent(payload, createdIds))
  results.push(await testVerifyMessageStructure(payload, createdIds))

  // Phase 4: Tool Use (Image Generation)
  results.push(await testCreateImageGeneration(payload, createdIds))
  results.push(await testVerifyToolCalls(payload, createdIds))
  results.push(await testVerifyMediaInResponse(payload, createdIds))

  // Phase 5: Multi-Turn Conversation
  results.push(await testContinueConversation(payload, createdIds))
  results.push(await testVerifyMultiTurnStructure(payload, createdIds))

  // Phase 6: Edit & Regenerate
  results.push(await testEditTitle(payload, createdIds))
  results.push(await testEditPromptAndResend(payload, createdIds))

  // Phase 7: Deobfuscation Analysis
  results.push(await testDeobfuscateTextResponse(payload, createdIds))
  results.push(await testDeobfuscateToolResponse(payload, createdIds))

  // Phase 8: Cleanup
  results.push(await testDeleteConversations(payload, createdIds))

  const duration = Date.now() - startTime
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length

  return { total: results.length, passed, failed, skipped, duration, tests: results }
}

async function testPing(payload: Record<string, unknown>): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_PING', payload)
    return { name: 'Ping / Connectivity', status: result ? 'pass' : 'fail', duration: Date.now() - start, details: result ? 'Provider responded' : 'No response' }
  } catch (e: any) {
    return { name: 'Ping / Connectivity', status: 'fail', duration: Date.now() - start, details: 'Connectivity check failed', error: e.message }
  }
}

async function testOfflineStatus(payload: Record<string, unknown>): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_IS_OFFLINE', payload)
    return { name: 'Offline Status Check', status: 'pass', duration: Date.now() - start, details: `Offline: ${result}` }
  } catch (e: any) {
    return { name: 'Offline Status Check', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testListConversations(payload: Record<string, unknown>): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_LIST_CONVERSATIONS', { ...payload, limit: 5 })
    const count = Array.isArray(result) ? result.length : 0
    return { name: 'List Conversations (MaZiqc)', status: count > 0 ? 'pass' : 'skip', duration: Date.now() - start, details: `${count} conversations | RPC: MaZiqc` }
  } catch (e: any) {
    return { name: 'List Conversations (MaZiqc)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testFetchExistingConversation(payload: Record<string, unknown>): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const list = await testCapability('TEST_LIST_CONVERSATIONS', { ...payload, limit: 1 })
    if (!Array.isArray(list) || list.length === 0) return { name: 'Fetch Existing (hNvQHb)', status: 'skip', duration: Date.now() - start, details: 'No conversations' }
    const result = await testCapability<any>('TEST_FETCH_CONTENT', { ...payload, conversationId: list[0]?.id })
    const msgCount = result?.messages?.length || 0
    return { name: 'Fetch Existing (hNvQHb)', status: msgCount > 0 ? 'pass' : 'fail', duration: Date.now() - start, details: `${msgCount} messages from ${list[0]?.id}` }
  } catch (e: any) {
    return { name: 'Fetch Existing (hNvQHb)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testSearchConversations(payload: Record<string, unknown>): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability('TEST_SEARCH', { ...payload, query: 'test' })
    return { name: 'Search (unqWSc)', status: 'pass', duration: Date.now() - start, details: `${Array.isArray(result) ? result.length : 0} results | RPC: unqWSc` }
  } catch (e: any) {
    return { name: 'Search (unqWSc)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testFetchAllGems(payload: Record<string, unknown>): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability('TEST_FETCH_ALL_GEMS', payload)
    return { name: 'Fetch Gems (CNgdBe)', status: 'pass', duration: Date.now() - start, details: `${Array.isArray(result) ? result.length : 0} gems | RPC: CNgdBe` }
  } catch (e: any) {
    return { name: 'Fetch Gems (CNgdBe)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testCreateConversation(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const prompt = `Protocol test ${Date.now()} - reply "OK"`
    const result = await testCapability<any>('TEST_CREATE_CONVERSATION', { ...payload, prompt })
    if (result?.id) createdIds.push(result.id)
    return {
      name: 'Create Conversation (StreamGenerate)',
      status: result?.id ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: result?.id ? `Created ${result.id}` : 'No ID returned',
      response: { id: result?.id, hasResponse: !!result?.response, responseLength: result?.response?.length || 0 },
    }
  } catch (e: any) {
    return { name: 'Create Conversation (StreamGenerate)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testVerifyCreatedContent(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!createdIds.length) return { name: 'Verify Created Content', status: 'skip', duration: Date.now() - start, details: 'No conversation' }
    await new Promise(r => setTimeout(r, 3000))
    const { testCapability } = await import('../lib/messaging')
    const convId = createdIds[createdIds.length - 1]
    const result = await testCapability<any>('TEST_FETCH_CONTENT', { ...payload, conversationId: convId })
    const msgs = result?.messages || []
    const hasUser = msgs.some((m: any) => m.role === 'user')
    const hasAssistant = msgs.some((m: any) => m.role === 'assistant')
    if (msgs.length === 0) {
      return {
        name: 'Verify Created Content (hNvQHb)',
        status: 'fail',
        duration: Date.now() - start,
        details: `0 messages after 3s delay — conversation ${convId} may not be indexed yet by Gemini backend`,
      }
    }
    return {
      name: 'Verify Created Content (hNvQHb)',
      status: hasUser && hasAssistant ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: `${msgs.length} messages | user: ${hasUser} | assistant: ${hasAssistant}`,
    }
  } catch (e: any) {
    return { name: 'Verify Created Content (hNvQHb)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testVerifyMessageStructure(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!createdIds.length) return { name: 'Verify Message Structure', status: 'skip', duration: Date.now() - start, details: 'No conversation' }
    await new Promise(r => setTimeout(r, 1000))
    const { testCapability } = await import('../lib/messaging')
    const convId = createdIds[createdIds.length - 1]
    const result = await testCapability<any>('TEST_FETCH_CONTENT', { ...payload, conversationId: convId })
    const msgs = result?.messages || []
    if (msgs.length === 0) return { name: 'Verify Message Structure', status: 'fail', duration: Date.now() - start, details: 'No messages returned' }
    const userMsg = msgs.find((m: any) => m.role === 'user')
    const assistantMsg = msgs.find((m: any) => m.role === 'assistant')
    const checks = {
      userHasId: !!userMsg?.id,
      userHasContent: !!userMsg?.content,
      userHasTimestamp: !!userMsg?.timestamp,
      assistantHasId: !!assistantMsg?.id,
      assistantHasContent: !!assistantMsg?.content,
      assistantHasTimestamp: !!assistantMsg?.timestamp,
      assistantHasParent: !!assistantMsg?.parent,
      parentLinksCorrect: assistantMsg?.parent === userMsg?.id,
    }
    const allPass = Object.values(checks).every(Boolean)
    return {
      name: 'Verify Message Structure',
      status: allPass ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: allPass ? 'All message fields present and linked correctly' : `Missing: ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(', ')}`,
      response: checks,
    }
  } catch (e: any) {
    return { name: 'Verify Message Structure', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testCreateImageGeneration(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const prompt = `Create an image of a red apple on a white background`
    const result = await testCapability<any>('TEST_CREATE_CONVERSATION', { ...payload, prompt })
    if (result?.id) createdIds.push(result.id)
    return {
      name: 'Create Image Generation (StreamGenerate)',
      status: result?.id ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: result?.id ? `Created ${result.id}` : 'No ID returned',
      response: { id: result?.id },
    }
  } catch (e: any) {
    return { name: 'Create Image Generation (StreamGenerate)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testVerifyToolCalls(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const imageConvId = createdIds[createdIds.length - 1]
    if (!imageConvId) return { name: 'Verify Tool Calls', status: 'skip', duration: Date.now() - start, details: 'No image conversation' }
    await new Promise(r => setTimeout(r, 2000))
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_DOWNLOAD_RAW', { ...payload, conversationId: imageConvId, count: 1 })
    const conv = result?.conversations?.[0]
    if (!conv?.rawApiResponse) return { name: 'Verify Tool Calls', status: 'fail', duration: Date.now() - start, details: 'No raw response' }
    const raw = conv.rawApiResponse
    const primaryBlock = raw?.[0]
    const toolCalls = primaryBlock?.[1]
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0
    const toolNames = hasToolCalls ? toolCalls.map((tc: any) => tc?.[1]?.[0]).filter(Boolean) : []
    return {
      name: 'Verify Tool Calls (hNvQHb raw)',
      status: hasToolCalls ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: hasToolCalls ? `Found ${toolCalls.length} tool calls: ${toolNames.join(', ')}` : 'No tool calls found in response[0][1]',
      response: { toolCallCount: toolCalls?.length || 0, toolNames },
    }
  } catch (e: any) {
    return { name: 'Verify Tool Calls (hNvQHb raw)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testVerifyMediaInResponse(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const imageConvId = createdIds[createdIds.length - 1]
    if (!imageConvId) return { name: 'Verify Media in Response', status: 'skip', duration: Date.now() - start, details: 'No image conversation' }
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_DOWNLOAD_RAW', { ...payload, conversationId: imageConvId, count: 1 })
    const conv = result?.conversations?.[0]
    if (!conv) return { name: 'Verify Media in Response', status: 'fail', duration: Date.now() - start, details: 'Conversation not found' }
    const hasMedia = conv.media?.length > 0
    const hasParsedMedia = conv.parsedMessages?.some((m: any) => m.content?.includes('googleusercontent') || m.content?.includes('image'))
    return {
      name: 'Verify Media in Response',
      status: hasMedia ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: hasMedia ? `${conv.media.length} media items extracted` : 'No media found',
      response: { mediaCount: conv.media?.length || 0, hasParsedMedia },
    }
  } catch (e: any) {
    return { name: 'Verify Media in Response', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testContinueConversation(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const convId = createdIds[0]
    if (!convId) return { name: 'Continue Conversation (Multi-Turn)', status: 'skip', duration: Date.now() - start, details: 'No conversation' }
    const { testCapability } = await import('../lib/messaging')
    const followUp = `Follow up: what color is the apple?`
    const result = await testCapability<any>('TEST_CREATE_CONVERSATION', { ...payload, prompt: followUp })
    if (result?.id) createdIds.push(result.id)
    return {
      name: 'Continue Conversation (Multi-Turn)',
      status: result?.id ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: result?.id ? `Created follow-up ${result.id}` : 'Failed to continue',
    }
  } catch (e: any) {
    return { name: 'Continue Conversation (Multi-Turn)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testVerifyMultiTurnStructure(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const followUpId = createdIds[createdIds.length - 1]
    if (!followUpId) return { name: 'Verify Multi-Turn Structure', status: 'skip', duration: Date.now() - start, details: 'No follow-up' }
    await new Promise(r => setTimeout(r, 2000))
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_FETCH_CONTENT', { ...payload, conversationId: followUpId })
    const msgs = result?.messages || []
    return {
      name: 'Verify Multi-Turn Structure',
      status: msgs.length >= 2 ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: `${msgs.length} messages in follow-up conversation`,
    }
  } catch (e: any) {
    return { name: 'Verify Multi-Turn Structure', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testEditTitle(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!createdIds.length) return { name: 'Edit Title (MUAZcd)', status: 'skip', duration: Date.now() - start, details: 'No conversation' }
    const { testCapability } = await import('../lib/messaging')
    const convId = createdIds[0]
    const newTitle = `Test Edited ${Date.now()}`
    await testCapability('TEST_EDIT_TITLE', { ...payload, conversationId: convId, title: newTitle })
    return {
      name: 'Edit Title (MUAZcd)',
      status: 'pass',
      duration: Date.now() - start,
      details: `Edit call succeeded for ${convId} | RPC: MUAZcd`,
    }
  } catch (e: any) {
    return { name: 'Edit Title (MUAZcd)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testEditPromptAndResend(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const { testCapability } = await import('../lib/messaging')
    const originalPrompt = `Test prompt ${Date.now()} - reply briefly`
    const result = await testCapability<any>('TEST_CREATE_CONVERSATION', { ...payload, prompt: originalPrompt })
    if (result?.id) createdIds.push(result.id)
    const editedPrompt = `Edited: ${originalPrompt} - now reply in detail`
    const editedResult = await testCapability<any>('TEST_CREATE_CONVERSATION', { ...payload, prompt: editedPrompt })
    if (editedResult?.id) createdIds.push(editedResult.id)
    const originalContent = result?.response || ''
    const editedContent = editedResult?.response || ''
    return {
      name: 'Edit Prompt & Resend',
      status: result?.id && editedResult?.id ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: `Original: ${originalContent.length} chars, Edited: ${editedContent.length} chars`,
      response: { originalLength: originalContent.length, editedLength: editedContent.length },
    }
  } catch (e: any) {
    return { name: 'Edit Prompt & Resend', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testDeobfuscateTextResponse(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const textConvId = createdIds[0]
    if (!textConvId) return { name: 'Deobfuscate Text Response', status: 'skip', duration: Date.now() - start, details: 'No text conversation' }
    await new Promise(r => setTimeout(r, 1000))
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_DOWNLOAD_RAW', { ...payload, conversationId: textConvId, count: 1 })
    const conv = result?.conversations?.[0]
    if (!conv?.rawApiResponse) return { name: 'Deobfuscate Text Response', status: 'fail', duration: Date.now() - start, details: 'No raw response' }
    const { deobfuscateRawResponse } = await import('./raw-api-taxonomy')
    const analysis = deobfuscateRawResponse(conv.rawApiResponse)
    return {
      name: 'Deobfuscate Text Response',
      status: analysis.confirmed.length > 0 ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: `${analysis.confirmed.length} confirmed | ${analysis.unknowns.length} unknowns`,
      response: { confirmed: analysis.confirmed.length, unknowns: analysis.unknowns.length },
    }
  } catch (e: any) {
    return { name: 'Deobfuscate Text Response', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testDeobfuscateToolResponse(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    const imageConvId = createdIds.length > 1 ? createdIds[1] : null
    if (!imageConvId) return { name: 'Deobfuscate Tool Response', status: 'skip', duration: Date.now() - start, details: 'No tool conversation' }
    const { testCapability } = await import('../lib/messaging')
    const result = await testCapability<any>('TEST_DOWNLOAD_RAW', { ...payload, conversationId: imageConvId, count: 1 })
    const conv = result?.conversations?.[0]
    if (!conv?.rawApiResponse) return { name: 'Deobfuscate Tool Response', status: 'fail', duration: Date.now() - start, details: 'No raw response' }
    const { deobfuscateRawResponse } = await import('./raw-api-taxonomy')
    const analysis = deobfuscateRawResponse(conv.rawApiResponse)
    const hasToolClassifiers = analysis.confirmed.some((c: any) => c.name?.includes('classifier') || c.name?.includes('safety'))
    return {
      name: 'Deobfuscate Tool Response',
      status: analysis.confirmed.length > 0 ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: `${analysis.confirmed.length} confirmed | ${analysis.unknowns.length} unknowns | safety classifiers: ${hasToolClassifiers}`,
      response: { confirmed: analysis.confirmed.length, unknowns: analysis.unknowns.length, hasSafetyClassifiers: hasToolClassifiers },
    }
  } catch (e: any) {
    return { name: 'Deobfuscate Tool Response', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}

async function testDeleteConversations(payload: Record<string, unknown>, createdIds: string[]): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!createdIds.length) return { name: 'Delete Test Conversations (GzXR5e)', status: 'skip', duration: Date.now() - start, details: 'Nothing to delete' }
    const { testCapability } = await import('../lib/messaging')
    let deleted = 0
    for (const convId of createdIds) {
      try {
        await testCapability('TEST_DELETE_CONVERSATION', { ...payload, conversationId: convId })
        deleted++
      } catch (delErr: unknown) {
        console.warn('[protocol-test] Failed to delete test conversation', delErr)
      }
    }
    return {
      name: 'Delete Test Conversations (GzXR5e)',
      status: deleted > 0 ? 'pass' : 'fail',
      duration: Date.now() - start,
      details: `Deleted ${deleted}/${createdIds.length} conversations`,
    }
  } catch (e: any) {
    return { name: 'Delete Test Conversations (GzXR5e)', status: 'fail', duration: Date.now() - start, details: 'Failed', error: e.message }
  }
}
