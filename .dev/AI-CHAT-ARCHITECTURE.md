# AI-Chat Panel — Architecture & Capability Report

**Date:** 2026-05-17
**Project:** Gemini Reverse Extension v0.2.0
**Status:** Research Phase — Awaiting Review

---

## 1. Executive Summary

This document catalogs all existing capabilities in the codebase, identifies gaps between current state and the desired AI-Chat panel experience, and proposes a layered architecture for implementation.

**Current State:** The extension is a *conversation archive/sync* tool — it intercepts Gemini network traffic, stores conversations in IndexedDB, and provides read-only viewing + basic mutations (edit title, delete, create via StreamGenerate).

**Target State:** A fully-capable chat panel that serves as a standalone Gemini client with model selection, tool selection, attachments, and real-time streaming.

---

## 2. Existing Capabilities Inventory

### 2.1 Conversation Lifecycle (✅ WORKING)

| Capability | RPC ID | Implementation | Status |
|---|---|---|---|
| List Conversations | `MaZiqc` | `batchexecute` → `fetchHeadersInternal` | ✅ Verified |
| Fetch Conversation Content | `hNvQHb` | `batchexecute` → `fetchContentInternal` | ✅ Verified |
| Search Conversations | `unqWSc` | `batchexecute` → `searchGeminiConversationsInternal` | ✅ Verified |
| Create Conversation | StreamGenerate (POST) | `createConversationInternal` | ✅ Verified |
| Edit Title | `MUAZcd` | `batchexecute` → `editConversationInternal` | ✅ Verified |
| Delete Conversation | `GzXR5e` | `batchexecute` → `deleteConversationInternal` | ✅ Verified |
| Multi-turn (continue) | StreamGenerate | Same as create, with conversation context | ✅ Verified |
| Fetch Gems (custom assistants) | `CNgdBe` | `batchexecute` → `fetchAllGems` | ✅ Verified |
| Ping / Auth Check | Profile fetch | `fetchProfile` | ✅ Verified |
| Offline Status | Profile comparison | `isOffline` | ✅ Verified |
| Get Chat URL | N/A (URL builder) | `getChatUrlInternal` | ✅ Verified |

### 2.2 Data Parsing & Processing (✅ WORKING)

| Capability | File | Status |
|---|---|---|
| Message parsing (`msgToIdb`) | `parser.ts` | ✅ Extracts user/assistant pairs |
| Header parsing (`dataToHeader`) | `parser.ts` | ✅ Extracts conversation metadata |
| Search result parsing | `parser.ts` | ✅ |
| Raw API deobfuscation | `raw-api-taxonomy.ts` | ✅ Full field taxonomy |
| Media extraction | `media-extract.ts` | ✅ Images, videos |
| Stream response parsing | `rpc.ts` → `parseStreamResponse` | ✅ Extracts conversation ID + text |
| Rate limit detection | `rpc.ts` → `parseResponse` | ✅ Sorry page / CAPTCHA detection |

### 2.3 Infrastructure (✅ WORKING)

| Component | File | Purpose |
|---|---|---|
| Service Worker | `service_worker.ts` | Message relay, network interception, sync |
| IndexedDB | `idb.ts` | Persistent storage (headers, conversations, accounts, orgs) |
| LiveStorage | `LiveStorage.ts` | Settings persistence |
| Provider Registry | `provider-registry.ts` | Multi-provider support (Gemini, OpenAI, Claude) |
| Rate Limiter | `rate-limiter.ts` | Request throttling |
| Auth | `auth.ts` | Profile/cookie-based auth |
| Network Interceptor | `network.ts` | Auto-sync on Gemini traffic |
| Sync Manager | `sync-manager.ts` | Background sync orchestration |

### 2.4 UI Components (✅ EXISTING)

| Component | File | Purpose |
|---|---|---|
| App Shell | `App.tsx` | Sidebar navigation, tab routing |
| Conversations Panel | `ConversationsPanel.tsx` | List + view synced conversations |
| Capabilities Panel | `CapabilitiesPanel.tsx` | Test harness for all RPC methods |
| Settings Panel | `SettingsPanel.tsx` | Configuration UI |
| Account Selector | `AccountSelector.tsx` | Multi-account switching |
| Media Gallery | `MediaGallery.tsx` | Media display component |
| UI Primitives | `ui/` | Button, Input, Card, Badge, Label, Separator, Switch, Tabs |
| State Management | `appStore.ts`, `settingsStore.ts` | Zustand stores |

### 2.5 Messaging Protocol (✅ EXISTING)

All communication between sidepanel and service worker uses `chrome.runtime.sendMessage`:
- Message types: `TEST_CREATE_CONVERSATION`, `TEST_FETCH_CONTENT`, `TEST_LIST_CONVERSATIONS`, etc.
- Handler: `handleCapabilityTest()` in `service_worker.ts`
- Pattern: `{ type: '...', providerId, accountId, ...payload }`

---

## 3. Gap Analysis — Desired vs. Available

### 3.1 Capabilities You Want

| Desired Capability | Available? | Gap Details |
|---|---|---|
| **Create new conversation** | ✅ Yes | `createConversationInternal` via StreamGenerate |
| **Type and send prompt** | ⚠️ Partial | Create works, but no dedicated chat input UI exists |
| **Send attachments** | ❌ NO | No file upload, no multi-modal input support in current codebase |
| **Select model/variant** | ❌ NO | Model is implicit (Gemini default). No model selection API discovered |
| **Select tools** (image, canvas, video, research, guided learning) | ❌ NO | Tool selection UI doesn't exist. Tools are triggered by prompt content only |
| **Real-time streaming response** | ⚠️ Partial | `parseStreamResponse` exists but is used for create, not incremental display |
| **Conversation history in chat** | ✅ Yes | `ConversationsPanel` shows messages, but not in a chat bubble format |
| **Multi-turn within same conversation** | ⚠️ Partial | Current create makes NEW conversations each time. No "continue in existing thread" API |
| **Edit/regenerate last message** | ❌ NO | No edit-prompt-and-resend API (only edit title exists) |
| **Tool call visualization** | ⚠️ Partial | Raw data has tool calls (`response[0][1]`), but no UI for displaying them |
| **Media display in chat** | ✅ Yes | `MediaGallery` component exists |
| **Conversation list sidebar** | ✅ Yes | `ConversationsPanel` exists |

### 3.2 Critical Missing Pieces

#### GAP 1: Multi-Turn in Existing Conversation (HIGH PRIORITY)
**Problem:** `createConversationInternal` always creates a *new* conversation via StreamGenerate. There is no API to send a follow-up message within an existing conversation thread.

**What we know:**
- StreamGenerate URL: `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
- Current request body: `[null,${JSON.stringify(JSON.stringify([[prompt]]))}]`
- The `null` at position 0 is likely the conversation context (currently empty = new conversation)
- For multi-turn, this likely needs the conversation ID and message history

**Investigation needed:** Intercept real Gemini web app traffic to discover the multi-turn request format.

#### GAP 2: Model/Variant Selection (HIGH PRIORITY)
**Problem:** No model selection mechanism exists. The raw API taxonomy shows `modelName` at `response[0][19]` (e.g., "Nano Banana 2", "Veo 3.1 Lite") but there's no known API to *select* a model.

**What we know:**
- Model name appears in response metadata
- `generationSettings` at `config[3][0]` contains model identifier
- Gemini web UI has model selector (Pro, Thinking, etc.)
- The model selection is likely part of the StreamGenerate request body or a separate RPC call

**Investigation needed:** Capture network traffic when switching models in Gemini web UI.

#### GAP 3: Attachment/File Upload (HIGH PRIORITY)
**Problem:** No file upload infrastructure exists anywhere in the codebase.

**What we know:**
- Gemini supports image, video, document, audio attachments
- Upload likely goes through a separate upload endpoint before StreamGenerate
- The `batchexecute` protocol may have an upload RPC

**Investigation needed:** Capture network traffic when attaching files in Gemini web UI.

#### GAP 4: Tool Selection (MEDIUM PRIORITY)
**Problem:** No tool selection mechanism. Tools (image generation, canvas, video, deep research, guided learning) are triggered implicitly by prompt content in the current implementation.

**What we know:**
- Gemini "Gems" (custom assistants) exist — fetched via `CNgdBe`
- Gems have IDs and can be associated with conversations (`gemId` in Header)
- Tool selection may be encoded in the StreamGenerate request body
- Gem selection URL pattern: `/gem/{gemId}/{conversationId}`

**Investigation needed:** Capture traffic when selecting tools in Gemini web UI.

#### GAP 5: Streaming Response Display (MEDIUM PRIORITY)
**Problem:** `parseStreamResponse` parses the full response after completion. No incremental/token-by-token streaming UI exists.

**What we know:**
- The StreamGenerate endpoint likely supports SSE or chunked responses
- Current implementation waits for full response then parses
- The `isStreaming` flag exists in response metadata (`response[0][7]`)

**Investigation needed:** Determine if StreamGenerate supports incremental reading via ReadableStream.

#### GAP 6: Chat UI (MEDIUM PRIORITY)
**Problem:** No chat-style message display exists. `ConversationsPanel` shows messages in a basic format, not a proper chat interface.

**What we have:**
- Message data structure: `{ role, content, timestamp, parent }`
- MediaGallery component for media display
- UI primitives (Card, Button, Input, etc.)

**What's needed:**
- Chat message bubbles (user right, assistant left)
- Typing indicator
- Markdown/code block rendering
- Tool call display cards
- Media inline display

---

## 4. Proposed Architecture

### 4.1 Panel Structure

```
App.tsx
├── Sidebar Navigation (existing)
│   ├── Overview
│   ├── Accounts
│   ├── Conversations  (existing — synced archive)
│   ├── AI-Chat        ← NEW PANEL
│   ├── Test           (existing — CapabilitiesPanel)
│   ├── Network
│   └── Settings
│
└── AI-Chat Panel (new)
    ├── ChatHeader
    │   ├── Model Selector (dropdown: Default, Pro, Thinking, etc.)
    │   ├── Tool Selector (chips: Image, Canvas, Video, Research, Learning)
    │   └── Account Selector (reuse existing)
    │
    ├── ConversationList (collapsible sidebar)
    │   ├── New Chat button
    │   ├── Recent conversations list
    │   └── Search conversations
    │
    ├── ChatArea (main)
    │   ├── WelcomeScreen (when no conversation)
    │   ├── MessageList
    │   │   ├── UserMessageBubble
    │   │   ├── AssistantMessageBubble
    │   │   │   ├── TextContent (with markdown rendering)
    │   │   │   ├── ToolCallCard (when tools invoked)
    │   │   │   ├── MediaInline (images, videos)
    │   │   │   └── TypingIndicator (during streaming)
    │   │   └── ErrorMessageBubble
    │   │
    │   └── ChatInput
    │       ├── AttachmentArea (preview uploaded files)
    │       ├── TextArea (auto-resize)
    │       ├── AttachmentButton
    │       └── SendButton
    │
    └── ChatFooter
        └── Model info / token usage
```

### 4.2 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SIDE PANEL (UI)                          │
│                                                                 │
│  AIChatPanel                                                    │
│  ├── ChatInput ────sendMessage()────┐                           │
│  ├── ModelSelector ──setModel()───┐ │                           │
│  ├── ToolSelector ───setTools()──┐│ │                           │
│  └── AttachmentHandler ──upload()┘││                           │
│                                    ││                           │
└────────────────────────────────────┼┼───────────────────────────┘
                                     ││
                          chrome.runtime.sendMessage()
                                     ││
┌────────────────────────────────────┼┼───────────────────────────┐
│                     SERVICE WORKER                               │
│                                                                 │
│  onMessage Listener                                             │
│  ├── CHAT_CREATE_CONVERSATION ──→ createConversationInternal()  │
│  ├── CHAT_SEND_MESSAGE ─────────→ sendMessageToConversation()   │
│  ├── CHAT_UPLOAD_ATTACHMENT ───→ uploadFileToGemini()           │
│  ├── CHAT_GET_CONVERSATIONS ───→ listConversations()            │
│  ├── CHAT_GET_MESSAGES ────────→ getConversation()              │
│  └── CHAT_STREAM_RESPONSE ─────→ streamGenerate()               │
│                                                                 │
│  GeminiProvider                                                 │
│  ├── createConversation()         [StreamGenerate - new]        │
│  ├── sendMessage()                [StreamGenerate - continue]   │
│  ├── uploadFile()                 [NEW — upload endpoint]       │
│  ├── listConversations()          [MaZiqc]                      │
│  └── getConversation()            [hNvQHb]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                     ││
                          HTTPS requests to gemini.google.com
                                     ││
┌────────────────────────────────────┼┼───────────────────────────┐
│                     GEMINI BACKEND                               │
│                                                                 │
│  /_/BardChatUi/data/assistant.lamda.BardFrontendService/        │
│    StreamGenerate          — Create/send messages               │
│  /_/BardChatUi/data/batchexecute                               │
│    MaZiqc                  — List conversations                 │
│    hNvQHb                  — Fetch conversation content         │
│    unqWSc                  — Search conversations               │
│    MUAZcd                  — Edit title                         │
│    GzXR5e                  — Delete conversation                │
│    CNgdBe                  — Fetch gems                         │
│    [TBD]                   — File upload                        │
│    [TBD]                   — Model selection                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 State Management

Extend existing `appStore.ts` with chat-specific state:

```typescript
interface ChatState {
  // Active conversation context
  activeConversationId: string | null
  activeConversationTitle: string
  
  // Message state
  messages: ChatMessage[]           // Local message list for active conversation
  isStreaming: boolean              // Whether a response is being streamed
  streamingContent: string          // Current streaming buffer
  
  // Input state
  inputText: string
  attachments: Attachment[]         // Pending file attachments
  
  // Configuration
  selectedModel: ModelVariant       // 'default' | 'pro' | 'thinking' | etc.
  selectedTools: ToolType[]         // ['image', 'canvas', 'video', 'research', 'learning']
  selectedGem: string | null        // Active gem (custom assistant) ID
  
  // Conversation list
  recentConversations: Header[]
  
  // Actions
  setActiveConversation: (id: string | null) => void
  addMessage: (msg: ChatMessage) => void
  updateStreamingContent: (content: string) => void
  setStreaming: (streaming: boolean) => void
  setInputText: (text: string) => void
  addAttachment: (attachment: Attachment) => void
  removeAttachment: (id: string) => void
  setSelectedModel: (model: ModelVariant) => void
  setSelectedTools: (tools: ToolType[]) => void
  setSelectedGem: (gemId: string | null) => void
  createNewConversation: () => void
  loadConversation: (id: string) => void
  sendMessage: (text: string) => Promise<void>
}
```

### 4.4 New Message Types (Service Worker)

Add to `service_worker.ts` message handler:

| Message Type | Handler | Purpose |
|---|---|---|
| `CHAT_CREATE_CONVERSATION` | `createConversationInternal` | Start new chat |
| `CHAT_SEND_MESSAGE` | `sendMessageToConversation` (NEW) | Send message to existing thread |
| `CHAT_UPLOAD_FILE` | `uploadFileToGemini` (NEW) | Upload attachment |
| `CHAT_GET_RECENT` | `listConversations` (existing) | Load recent conversations |
| `CHAT_GET_MESSAGES` | `getConversation` (existing) | Load conversation messages |
| `CHAT_DELETE_MESSAGE` | TBD | Delete specific message |
| `CHAT_REGENERATE` | TBD | Regenerate last response |

### 4.5 File Structure (New Files)

```
sidepanel/
├── components/
│   ├── AIChatPanel.tsx              ← Main panel component
│   ├── ChatHeader.tsx               ← Model + tool selectors
│   ├── ChatArea.tsx                 ← Message list + input
│   ├── ChatInput.tsx                ← Text input + attachments
│   ├── ChatMessage.tsx              ← Message bubble component
│   ├── ConversationSidebar.tsx      ← Collapsible conversation list
│   ├── ModelSelector.tsx            ← Model variant dropdown
│   ├── ToolSelector.tsx             ← Tool chips/buttons
│   ├── AttachmentPreview.tsx        ← File preview thumbnails
│   ├── TypingIndicator.tsx          ← Streaming animation
│   ├── WelcomeScreen.tsx            ← Empty state
│   └── ToolCallCard.tsx             ← Tool execution display
│
├── stores/
│   └── chatStore.ts                 ← Zustand store for chat state
│
└── lib/
    ├── chat-messaging.ts            ← Chat-specific message handlers
    ├── file-upload.ts               ← Attachment upload logic
    ├── model-config.ts              ← Model variant configurations
    └── markdown-renderer.ts         ← Markdown/code rendering
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create `AIChatPanel.tsx` with basic layout
- [ ] Wire up `ChatInput` → `CHAT_CREATE_CONVERSATION` (reuse existing create)
- [ ] Display messages from `getConversation` in chat bubble format
- [ ] Add `chatStore.ts` with basic state
- [ ] Register new tab in `App.tsx` navigation

**Deliverable:** Basic text-only chat — create conversation, send prompt, see response.

### Phase 2: Multi-Turn & Streaming (Week 2-3)
- [ ] **BLOCKER:** Discover multi-turn request format (network interception needed)
- [ ] Implement `CHAT_SEND_MESSAGE` for continuing existing conversations
- [ ] Implement streaming response display (incremental text)
- [ ] Add typing indicator
- [ ] Add conversation sidebar with recent chats

**Deliverable:** Full multi-turn conversation with streaming responses.

### Phase 3: Model & Tool Selection (Week 3-4)
- [ ] **BLOCKER:** Discover model selection API (network interception needed)
- [ ] **BLOCKER:** Discover tool selection API (network interception needed)
- [ ] Implement `ModelSelector` component
- [ ] Implement `ToolSelector` component
- [ ] Wire model/tool selections into request body
- [ ] Add `ToolCallCard` for displaying tool executions

**Deliverable:** Model variant switching + tool selection.

### Phase 4: Attachments (Week 4-5)
- [ ] **BLOCKER:** Discover file upload API (network interception needed)
- [ ] Implement `CHAT_UPLOAD_FILE` handler
- [ ] Implement `AttachmentPreview` component
- [ ] Add attachment button to `ChatInput`
- [ ] Support images, documents, audio

**Deliverable:** File attachment support.

### Phase 5: Polish (Week 5-6)
- [ ] Markdown/code block rendering
- [ ] Media inline display in messages
- [ ] Error handling & retry
- [ ] Keyboard shortcuts (Enter to send, Shift+Enter for newline)
- [ ] Copy message button
- [ ] Regenerate response

---

## 6. Known Complexities & Risks

### 6.1 Multi-Turn Request Format (CRITICAL BLOCKER)
The current `createConversationInternal` sends:
```
[null, JSON.stringify(JSON.stringify([[prompt]]))]
```
The `null` at position 0 is almost certainly the conversation context. For multi-turn, this needs to include:
- Conversation ID
- Parent message ID
- Possibly full message history

**Risk:** Without knowing the exact format, multi-turn cannot be implemented. Requires network interception of real Gemini web app traffic.

### 6.2 Model Selection Mechanism (CRITICAL BLOCKER)
No API for model selection has been reverse-engineered. Possibilities:
1. Part of StreamGenerate request body (undiscovered field)
2. Separate RPC call before StreamGenerate
3. URL parameter or header
4. Cookie-based state

**Risk:** Model selection is a core requirement. Cannot implement without discovery.

### 6.3 File Upload Protocol (CRITICAL BLOCKER)
Gemini's file upload likely involves:
1. Upload file to a staging endpoint
2. Receive a file reference/ID
3. Include file reference in StreamGenerate request

**Risk:** Multi-modal input is a core requirement. Cannot implement without discovery.

### 6.4 Rate Limiting
Current rate limiter: 5 requests per 10s window. Chat usage will hit this quickly.
- Need to adjust rate limits for interactive chat
- Consider request queuing for rapid typing

### 6.5 Response Size & Parsing
- `parseStreamResponse` currently expects full response
- Streaming requires incremental parsing
- The obfuscated response format (`response[0][1][0]` etc.) may need different parsing for partial responses

### 6.6 Tool Call Detection
The "Verify Tool Calls" test currently fails — tool calls are not found at `response[0][1]` for image generation responses. This suggests:
- Tool call structure may differ by tool type
- Image generation may use a different response path
- The raw-api-taxonomy mapping may need refinement

---

## 7. Discovery Tasks Required

Before implementation can proceed, the following network interception tasks are needed:

| # | Task | Priority | Method |
|---|---|---|---|
| 1 | Capture multi-turn message request body | P0 | Intercept Gemini web app when sending follow-up message |
| 2 | Capture model selection request | P0 | Intercept when switching between Default/Pro/Thinking |
| 3 | Capture file upload flow | P0 | Intercept when attaching a file to a message |
| 4 | Capture tool selection request | P1 | Intercept when selecting Image/Canvas/Video/Research tools |
| 5 | Capture streaming response format | P1 | Observe chunked response from StreamGenerate |
| 6 | Capture regenerate/edit message flow | P2 | Intercept when regenerating a response in Gemini web |

---

## 8. Reusable Assets (Already Built)

These can be directly reused in the AI-Chat panel:

| Asset | Location | Reuse Strategy |
|---|---|---|
| `createConversationInternal` | `gemini/index.ts` | Direct import — works for new conversations |
| `getConversation` | `gemini/index.ts` | Direct import — loads message history |
| `listConversations` | `gemini/index.ts` | Direct import — conversation sidebar |
| `search` | `gemini/index.ts` | Direct import — search in sidebar |
| `MediaGallery` | `components/MediaGallery.tsx` | Direct import — media display |
| `AccountSelector` | `components/AccountSelector.tsx` | Direct import — account switching |
| `extractMediaFromMessages` | `lib/media-extract.ts` | Direct import — media parsing |
| `nameRawApiResponse` | `CapabilitiesPanel.tsx` | Extract to shared utility — tool call display |
| `deobfuscateRawResponse` | `lib/raw-api-taxonomy.ts` | Direct import — response analysis |
| UI primitives | `components/ui/` | Direct import — all shadcn components |
| `appStore` pattern | `stores/appStore.ts` | Pattern reference — create `chatStore` |
| Message type routing | `service_worker.ts` | Extend with `CHAT_*` message types |
| Rate limiter | `rate-limiter.ts` | Direct import — may need config adjustment |
| Auth (`fetchProfile`) | `gemini/auth.ts` | Direct import — auth for chat requests |
| `batchexecute` | `gemini/rpc.ts` | Direct import — all RPC calls |

---

## 9. Recommendations

1. **Start with Phase 1 immediately** — text-only chat is fully implementable with existing APIs
2. **Run network interception in parallel** — tasks #1-3 from Section 7 should start ASAP as they block later phases
3. **Consider using the existing `ConversationsPanel`** as the conversation list sidebar rather than building a new one
4. **Add a `TEST_PROTOCOL_SUITE` capability** that specifically tests multi-turn, model selection, and file upload once those APIs are discovered
5. **The "Verify Tool Calls" test failure** should be investigated — it may reveal important information about tool call response structure

---

## 10. Appendix: RPC ID Reference

| RPC ID | Purpose | Request Args Pattern |
|---|---|---|
| `MaZiqc` | List conversations | `[limit, cursor?, [0, null, 1]]` |
| `hNvQHb` | Fetch conversation | `["c_{id}", 100, cursor?, 1, [1]]` |
| `unqWSc` | Search | `[query]` |
| `MUAZcd` | Edit title | `[null, [["title"]], ["c_{id}", newTitle]]` |
| `GzXR5e` | Delete | `["c_{id}", 1]` |
| `CNgdBe` | Fetch gems | `[100, null]` |
| StreamGenerate | Create/send | `[null, JSON.stringify([[prompt]])]` (new) / `[context, ...]` (multi-turn, TBD) |
