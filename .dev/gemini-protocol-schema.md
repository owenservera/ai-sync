# Gemini API Protocol Schema — Confirmed Reference

> Extracted from reverse-engineered extension core (`STEP-2-gemini-reconstructed.ts`) and runtime analysis.
> All entries are **confirmed working** — each has been exercised in production code.

---

## 1. Endpoints

| Endpoint | URL | Purpose |
|----------|-----|---------|
| **batchexecute** | `https://gemini.google.com/_/BardChatUi/data/batchexecute` | All RPC calls (list, fetch, search, edit, delete, gems) |
| **StreamGenerate** | `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate` | Create conversation / get streamed response |
| **Profile page** | `https://gemini.google.com[/u/{index}]/app` | Extract auth token (`SNlM0e`) and account info |

---

## 2. Request Format

### batchexecute

```
POST /_/BardChatUi/data/batchexecute?rpcids={rpcId}
Content-Type: application/x-www-form-urlencoded;charset=UTF-8

at={token}&f.req=[[["{rpcId}","{JSON-stringified-args}",null,"generic"]]]
```

- `at` — auth token from profile page (`SNlM0e`)
- `rpcId` — 6-char RPC identifier
- Args are **double-JSON-stringified** (JSON.stringify then escaped into the f.req string)
- `/u/{index}` path prefix for multi-account (0 = default, no prefix)

### StreamGenerate

```
POST /_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate
Content-Type: application/x-www-form-urlencoded;charset=UTF-8

at={token}&f.req=[null,"[[\"{prompt}\"]]"]
```

---

## 3. Response Parsing

All batchexecute responses follow the same envelope:

```
Response text → find rpcId key → slice between key+2 and `,null,null,null,"generic"`
→ JSON.parse(outer) → JSON.parse(inner) → decoded data
```

---

## 4. RPC IDs — Confirmed

| RPC ID | Name | Args | Response | Status |
|--------|------|------|----------|--------|
| `hNvQHb` | Fetch Content | `[conversationId, limit, cursor, 1, [1]]` | Messages array + cursor + metadata | ✅ Working |
| `MaZiqc` | List Conversations | `[limit, cursor, [0, null, 1]]` or `[limit, cursor]` | Headers array + cursor + data[2] | ✅ Working |
| `unqWSc` | Search | `[query]` | Search results array | ✅ Working |
| `MUAZcd` | Edit Title | `[null, [["title"]], [conversationId, title]]` | Confirmation | ✅ Working |
| `GzXR5e` | Delete | `[conversationId, 1]` | Confirmation | ✅ Working |
| `CNgdBe` | Fetch Gems | `[limit, cursor]` | Gem definitions array | ✅ Working |
| `o30O0e` | Profile Info | (intercepted from page requests) | Account profile data | ✅ Working |
| `PCck7e` | Summary | (referenced in onFetch) | — | ⚠️ Known, not directly called |
| `qWymEb` | Unknown | (modifying RPC) | — | ⚠️ Known ID only |
| `HcT8bb` | Unknown | (modifying RPC) | — | ⚠️ Known ID only |

---

## 5. Response Schemas

### 5.1 Fetch Content (`hNvQHb`)

**Top-level:**
```
[
  [message1, message2, ...],   // [0] messages array
  cursor,                       // [1] pagination cursor (null = no more)
  responseMetadata              // [2] media + safety classifier data
]
```

**Each message tuple (5 elements):**
```
[
  [conversationId, messageId],  // [0] idPair
  [?, parentId],                // [1] parentInfo
  [[userText]],                 // [2] content
  response,                     // [3] assistant response (complex)
  [seconds, nanoseconds]        // [4] timestamp
]
```

**Response block (message[3]) — TWO LEVELS:**

**Level 1 — Nested in `response[0]` (primaryBlock):**
```
response[0][0] — response data tuple
  [0] = responseId (string, e.g. "rc_xxx")
  [1] = [responseText, ...additionalParts]
  [2] = promptPreview (string or null)
  [3] = promptFull (string or null)
response[0][1] = toolCalls[] — array of tool execution traces
response[0][2] = toolResults
response[0][5] = locale (e.g. "ES", "en")
response[0][6] = isComplete (boolean)
response[0][7] = isStreaming (boolean)
response[0][12] = usageStats array [inputTokens?, outputTokens?, total?]
response[0][13] = conversationHash (string)
response[0][15] = conversationHash (string, may differ from [13])
response[0][19] = modelName (e.g. "Nano Banana 2", "Veo 3.1 Lite")
response[0][22] = modelVersion (number)
```

**Level 2 — Flat duplicates at `response[i]` top-level:**
```
response[1] = toolStateSnapshots[]
response[2] = toolResultsSnapshot
response[3] = responseId (duplicate of [0][0][0])
response[4] = toolCalls (duplicate of [0][1])
response[5] = toolResults (duplicate of [0][2])
response[8] = locale (duplicate of [0][5])
response[9] = isComplete (duplicate of [0][6])
response[10] = isStreaming (duplicate of [0][7])
response[14] = conversationHash (duplicate of [0][13])
response[17] = conversationHash (duplicate of [0][15])
response[21] = modelName (duplicate of [0][19])
response[24] = modelVersion (duplicate of [0][22])
```

**Response metadata (result[2]):**
```
result[2][0][0][0][0] = responseConfigs[]
  Each config:
    [0] = mediaMetadata (image or video)
      Images:  [?, index, filename, thumbnailUrl, ?, base64, ?, ?, ?, [ts, ns], ?, mimeType, ?, ?, ?, [width, height, fileSize]]
      Videos:  [?, index, filename, thumbnailUrl, ?, base64, ?, downloadUrls[], ?, [ts, ns], ?, mimeType, ?, ?, ?, [[duration, ns], width, height]]
    [1] = promptInfo [promptUrl, ?, promptText]
    [3] = generationSettings [model, promptText, ..., safetyFilter, ?, complaintFlow]

result[2][0][0][1] = preGenerationSafetyClassifiers[]
result[2][0][0][2] = postGenerationSafetyClassifiers[]
```

**Safety classifier entry:**
```
[
  classifierName,    // [0] e.g. "text_safety_classifier", "rai_video_classifier_v4"
  results[],         // [1] array of [label, ?, score]
  resultType,        // [2] e.g. "RaiClassifierResult"
  numericId          // [3] string numeric ID
]
```

**Tool call entry:**
```
[
  toolId,            // [0] null or string
  [toolName, toolStatus, statusMessage, statusDetail],  // [1]
  toolState,         // [2]
  toolResult         // [3]
]
```

---

### 5.2 List Conversations (`MaZiqc`)

**Top-level:**
```
[
  ?,               // [0] unknown
  cursor,          // [1] next page cursor (null = end)
  data             // [2] conversation entries (array or JSON string)
]
```

**Each conversation entry:**
```
[
  id,              // [0] "c_xxx"
  title,           // [1] conversation title
  ?,               // [2]
  ?,               // [3]
  ?,               // [4]
  timestamp,       // [5] Unix seconds (or [seconds, nanoseconds])
  ?,               // [6]
  gemId            // [7] optional Gem ID string
]
```

---

### 5.3 Search (`unqWSc`)

**Top-level:**
```
[
  rows[]           // [0] array of search result rows
]
```

**Each row:**
```
[
  rowData,         // [0]
    [0] = id ("c_xxx")
    [1] = title
  ?,               // [1]
  timestampData    // [2]
    [0][3][0] = timestamp
]
```

---

### 5.4 Profile Info (`o30O0e`)

```
responseBody[0][0][2] = profileData
  [0] = accountId
  [2][0][1] = name
  [9][0][1] = email
```

---

### 5.5 StreamGenerate (`wrb.fr` format)

Response is a different format — not batchexecute:
```
[["wrb.fr", ..., dataJsonString, ...]]
```

Parse `dataJsonString`:
```
inner[1][0] = conversationId (split by "_" to get ID)
inner[4][0][1][0] = responseText (primary)
inner[4][0][0] = responseText (fallback)
```

---

### 5.6 Gem Definitions (`CNgdBe`)

```
result[2] = gemEntries[]
  Each entry:
    [0] = gemId
    [1][0] = gemName
```

---

## 6. Auth Token Extraction

From profile page HTML (`/app`):
- `SNlM0e` → auth token (`at`) — try JSON extraction first, fallback regex `[a-zA-Z0-9_-]{26,30}:[0-9]{13,}`
- `S06Grb` → account ID
- Name/email from pattern `: {name} ({email})"`

---

## 7. Rate Limiting

- Max 5 requests per 10-second window
- Minimum 1 second between requests
- Rate limit detected via `/sorry/` page or CAPTCHA text
- Auto-reset after 5 minutes

---

## 8. Known Unknowns — Fields Requiring Investigation

### Primary block (response[0])
| Position | Type | Notes |
|----------|------|-------|
| `response[0][3]` | ? | Always null? |
| `response[0][4]` | ? | Always null? |
| `response[0][8]`–`[11]` | ? | Unknown |
| `response[0][14]` | ? | Unknown |
| `response[0][16]`–`[18]` | ? | Unknown |
| `response[0][20]`–`[21]` | ? | Unknown |
| `response[0][23]+` | ? | Unknown |

### Response top-level
| Position | Type | Notes |
|----------|------|-------|
| `response[6]`–`[7]` | ? | Unknown |
| `response[11]`–`[13]` | ? | Unknown |
| `response[15]`–`[16]` | ? | Unknown |
| `response[18]`–`[20]` | ? | Unknown |
| `response[22]`–`[23]` | ? | Unknown |
| `response[25]+` | ? | Unknown |

### Conversation list
| Position | Type | Notes |
|----------|------|-------|
| `entry[2]`–`[4]` | ? | Unknown |
| `entry[6]` | ? | Unknown |
| `result[0]` | ? | Unknown |

### Response metadata
| Position | Type | Notes |
|----------|------|-------|
| `result[2][0][0][0][0][config][2]` | null | Always null? |
| `result[2][0][0][0][0][config][3][4]`–`[14]` | ? | Settings array middle elements |

---

## 9. Protocol Rules

1. **All batchexecute requests** use `f.req=[[["{rpcId}","{args}",null,"generic"]]]` format
2. **Response delimiter** is always `,null,null,null,"generic"`
3. **Double JSON encoding** — response text is JSON containing a JSON string
4. **Timestamps** are Unix seconds (multiply by 1000 for ms), sometimes `[seconds, nanoseconds]`
5. **IDs** use `c_` prefix for conversations, `r_` for messages, `rc_` for responses
6. **Pagination** — cursor from `result[1]`, pass as second arg for next page
7. **Auth tokens** expire ~3 minutes, cached in memory
8. **Multi-account** — `/u/{index}` URL prefix, index from cookies

---

## 10. Full User Journey Test Plan

The protocol test suite (`protocol-test-suite.ts`) validates the complete user interaction cycle:

### Phase 1: Connectivity & Auth
| Test | What it verifies |
|------|-----------------|
| Ping | Auth token works, provider responds |
| Offline status | Account authentication state |

### Phase 2: Read Existing Data
| Test | RPC | What it verifies |
|------|-----|-----------------|
| List conversations | `MaZiqc` | Pagination, cursor, header parsing |
| Fetch existing | `hNvQHb` | Message retrieval, content structure |
| Search | `unqWSc` | Query parsing, result ranking |
| Fetch gems | `CNgdBe` + `MaZiqc` | Gem definitions + conversation listing |

### Phase 3: Create & Basic Interaction
| Test | Endpoint | What it verifies |
|------|----------|-----------------|
| Create conversation | `StreamGenerate` | New chat creation, response parsing |
| Verify content | `hNvQHb` | Message persistence, user/assistant pairing |
| Verify structure | — | ID generation, timestamps, parent links |

### Phase 4: Tool Use (Image Generation)
| Test | What it verifies |
|------|-----------------|
| Create image gen | Tool invocation via prompt |
| Verify tool calls | `response[0][1]` contains tool execution traces |
| Verify media | Media extraction from raw response |

### Phase 5: Multi-Turn Conversation
| Test | What it verifies |
|------|-----------------|
| Continue conversation | Follow-up message creation |
| Verify multi-turn | Message chain integrity |

### Phase 6: Edit & Regenerate
| Test | RPC | What it verifies |
|------|-----|-----------------|
| Edit title | `MUAZcd` | Title update, list reflection |
| Edit prompt & resend | `StreamGenerate` | Prompt modification, response comparison |

### Phase 7: Deobfuscation Analysis
| Test | What it verifies |
|------|-----------------|
| Text response | Field mapping for simple text conversations |
| Tool response | Safety classifiers, tool metadata, media config |

### Phase 8: Cleanup
| Test | RPC | What it verifies |
|------|-----|-----------------|
| Delete conversations | `GzXR5e` | Cleanup, no orphaned data |

### User Journey Flow
```
User opens Gemini
  → Auth check (Ping, Offline)
  → Views existing chats (List, Fetch, Search)
  → Starts new chat (Create via StreamGenerate)
  → Sends prompt (included in Create)
  → Receives response (Verify Content, Verify Structure)
  → Requests image generation (Create Image)
  → Tool executes (Verify Tool Calls)
  → Media appears (Verify Media)
  → Continues conversation (Multi-Turn)
  → Edits title (Edit Title)
  → Modifies prompt, resends (Edit & Resend)
  → Cleans up (Delete)
```
