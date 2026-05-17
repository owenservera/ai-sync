# Central Capability Engine — Design Specification

**Date:** 2026-05-17
**Scope:** Entire application — replaces all scattered capability declarations
**Status:** Design — Awaiting Approval
**Sources:** `.dev/STEP-2-gemini-reconstructed-v2.ts`, `.dev/gemini-capabilities-extract.js`, `src/types.ts`, `src/providers/provider-interface.ts`, `background/service_worker.ts`, `sidepanel/components/CapabilitiesPanel.tsx`, `sidepanel/stores/chatStore.ts`

---

## 1. Problem Statement

Capabilities are currently defined in three disconnected places with no enforcement:

| Layer | Location | Purpose | Problem |
|---|---|---|---|
| Provider config | `src/providers/*/index.ts` | Declares what a provider supports | Display-only badges in OverviewPanel |
| Test harness | `CapabilitiesPanel.tsx` | UI for testing capabilities | 16 entries, no validation against provider |
| Service worker | `handleCapabilityTest()` | Executes operations | ~20 case handlers, no capability checks, duplicated logic |

**Consequences:**
- `hasCapability()` is called once in the entire codebase (`sync-manager.ts` line 24)
- Service worker executes any message type — no gate against unsupported operations
- Test panel shows buttons for capabilities the provider doesn't implement
- New code (AI Chat) has no way to query "what can I do?" at runtime
- Adding a capability requires edits in 3-4 places
- Fire-and-forget message types (`DELETE_CONVERSATION`, `EDIT_TITLE`, `SYNC_PROVIDER`) bypass the capability system entirely

---

## 2. Complete Capability Inventory

### 2.1 Source Analysis

From the three primary sources, here is the **definitive list** of every operation currently in the system:

#### From `CapabilitiesPanel.tsx` (16 test entries):

| # | ID | Message Type | Label | Category |
|---|---|---|---|---|
| 1 | `list` | `TEST_LIST_CONVERSATIONS` | List Conversations | Core |
| 2 | `fetch` | `TEST_FETCH_CONTENT` | Fetch Conversation | Core |
| 3 | `edit` | `TEST_EDIT_TITLE` | Edit Title | Core |
| 4 | `delete` | `TEST_DELETE_CONVERSATION` | Delete Conversation | Core |
| 5 | `create` | `TEST_CREATE_CONVERSATION` | Create Conversation | Core |
| 6 | `summary` | `TEST_FETCH_SUMMARY` | Fetch Summary | Provider |
| 7 | `gems` | `TEST_FETCH_ALL_GEMS` | Fetch All Gems | Provider |
| 8 | `search` | `TEST_SEARCH` | Search Conversations | Core |
| 9 | `sync` | `TEST_SYNC_MISSING` | Sync Missing from Search | Utility |
| 10 | `ping` | `TEST_PING` | Ping / Connectivity | Core |
| 11 | `offline` | `TEST_IS_OFFLINE` | Check Offline Status | Provider |
| 12 | `url` | `TEST_GET_CHAT_URL` | Get Chat URL | Core |
| 13 | `downloadRaw` | `TEST_DOWNLOAD_RAW` | Download Raw Data | Utility |
| 14 | `deobfuscate` | `TEST_DEOBFUSCATE` | Deobfuscate Raw API | Utility |
| 15 | `protocolTest` | `TEST_PROTOCOL_SUITE` | Protocol Test Suite | Meta |
| 16 | `media` | `TEST_DOWNLOAD_MEDIA` | Download Media | Utility |

#### From `service_worker.ts` (additional non-test message types):

| # | Message Type | Purpose | Currently |
|---|---|---|---|
| 17 | `GET_STATE` | Provider state overview | Direct handler |
| 18 | `SYNC_PROVIDER` | Trigger full sync | Direct handler |
| 19 | `SYNC_CONVERSATION` | Sync single conversation | Direct handler |
| 20 | `DELETE_CONVERSATION` | Fire-and-forget delete | Direct handler |
| 21 | `EDIT_TITLE` | Fire-and-forget edit | Direct handler |
| 22 | `GET_ACCOUNTS` | List accounts with metadata | Direct handler |
| 23 | `SET_ACTIVE_ACCOUNT` | Set active account preference | Direct handler |
| 24 | `GET_ACTIVE_ACCOUNT` | Get active account preference | Direct handler |
| 25 | `GET_ALL_HEADERS` | Get all conversation headers for a service | Direct handler |
| 26 | `GET_SETTINGS` | Get extension settings | Direct handler |
| 27 | `SET_SETTINGS` | Update extension settings | Direct handler |
| 28 | `GET_RATE_LIMIT_STATUS` | Check rate limit state | Routed to `handleCapabilityTest` |
| 29 | `FETCH_MEDIA_AS_BASE64` | Convert media URLs to base64 | Routed to `handleCapabilityTest` |

#### From `gemini-capabilities-extract.js` (content-script bridge operations):

| # | Operation | Mechanism | Description |
|---|---|---|---|
| 30 | `chat-send` | Content script DOM injection | Inject prompt into Gemini's textarea and click send |
| 31 | `chat-read-ui` | Content script DOM reading | Read model selection, active tools from Gemini UI |
| 32 | `chat-navigate` | Content script tab navigation | Navigate Gemini tab to specific conversation |
| 33 | `chat-inject-prompt` | Cross-frame `postMessage` | Receive prompt from PromptForge iframe, inject into textarea |
| 34 | `chat-export-response` | Content script DOM extraction | Extract model response text from DOM |
| 35 | `chat-detect-theme` | Content script class detection | Detect light/dark theme on Gemini page |
| 36 | `chat-observe-url` | MutationObserver on document | Detect URL changes for conversation navigation |
| 37 | `chat-inject-header` | Content script DOM creation | Inject prompt attribution header into page |
| 38 | `chat-inject-selectors` | Content script UI injection | Inject language/tone/style selector dropdowns |
| 39 | `chat-inject-export-btns` | Content script button injection | Add export buttons to each message |

#### From `STEP-2-gemini-reconstructed-v2.ts` (provider interface methods):

| # | Method | Category | Description |
|---|---|---|---|
| 40 | `detectAccounts()` | Auth | Scan up to 10 account indices, extract profiles |
| 41 | `refreshAuth(account)` | Auth | Refresh auth token for a given account |
| 42 | `isAuthenticated(account)` | Auth | Check if account is still authenticated |
| 43 | `onAccountDetected(email)` | Auth | Handle new account detection from browser events |
| 44 | `handleNetworkActivity(details)` | Network | Intercept network requests, return SyncTrigger |
| 45 | `fetchAllGems(org)` | Provider | List custom Gemini assistant conversations |
| 46 | `fetchSummary(prompt, systemPrompt?)` | Provider | One-shot AI prompt (creates + deletes temp conversation) |
| 47 | `syncMissingFromSearch(results, account)` | Utility | Download conversations not in local DB |

### 2.2 Capability Taxonomy (Consolidated)

Five categories, each with distinct execution semantics:

#### Category A: Core Capabilities

Universal operations that every provider SHOULD implement. Mapped directly to `ConversationProvider` interface methods.

| Capability ID | Provider Method | Message Type | Description |
|---|---|---|---|
| `conversation-list` | `listConversations(account, cursor?, limit?)` | `TEST_LIST_CONVERSATIONS` | Paginated conversation listing |
| `message-fetch` | `getConversation(account, conversationId)` | `TEST_FETCH_CONTENT` | Full conversation content with messages |
| `search` | `search(account, query)` | `TEST_SEARCH` | Text search across conversations |
| `create-conversation` | `createConversation(account, prompt, signal?)` | `TEST_CREATE_CONVERSATION` | Start new conversation |
| `edit-title` | `editTitle(account, conversationId, title)` | `TEST_EDIT_TITLE` / `EDIT_TITLE` | Rename conversation |
| `delete-conversation` | `deleteConversation(account, conversationId)` | `TEST_DELETE_CONVERSATION` / `DELETE_CONVERSATION` | Remove conversation |
| `ping` | `ping(account)` | `TEST_PING` | Connectivity check |
| `get-chat-url` | `getChatUrl(conversation)` | `TEST_GET_CHAT_URL` | Build provider URL for conversation |

#### Category B: Provider Capabilities

Provider-specific operations that only some providers implement.

| Capability ID | Implementation | Provider | Description |
|---|---|---|---|
| `fetch-all-gems` | `fetchAllGems(org)` | Gemini only | List custom Gemini assistant conversations |
| `fetch-summary` | `summarize(account, prompt, systemPrompt?)` | Gemini only | One-shot AI prompt (temp conversation) |
| `auto-sync` | `handleNetworkActivity(details)` | Gemini only | Network interception for auto-sync |
| `is-offline` | `isOffline(accountId)` | Gemini only | Check if account still authenticated |
| `detect-accounts` | `detectAccounts()` | All providers | Scan for authenticated accounts |
| `refresh-auth` | `refreshAuth(account)` | All providers | Refresh auth token |
| `is-authenticated` | `isAuthenticated(account)` | All providers | Verify authentication status |

#### Category C: Utility Capabilities

Cross-cutting operations that work on any provider's data. These are NOT provider methods — they're service-level utilities operating on IndexedDB data + raw API responses.

| Capability ID | Handler | Description |
|---|---|---|
| `download-raw` | Inline service worker function | Fetch raw API response for conversation(s) |
| `deobfuscate` | `deobfuscateRawResponse()` from raw-api-taxonomy | Analyze raw API structure |
| `download-media` | `extractMediaFromMessages()` + `extractMediaItemsFromRaw()` | Extract media from conversation |
| `sync-missing` | `syncMissingFromSearch()` | Download conversations not in local DB |
| `get-all-headers` | Direct IndexedDB query | Get all conversation headers for a service |
| `fetch-media-base64` | Service worker fetch + btoa | Convert remote media URLs to base64 |
| `get-rate-limit-status` | IndexedDB service state query | Check if provider is rate-limited |

#### Category D: Bridge Capabilities

Content-script based operations that interact with the provider's web UI directly. Enable multi-turn, model selection, and attachments without API reverse-engineering.

| Capability ID | Handler | Description |
|---|---|---|
| `chat-send` | Content script injection on gemini.google.com | Inject prompt into textarea, click send |
| `chat-read-ui` | Content script DOM reading | Read model selection, active tools from UI |
| `chat-navigate` | Content script tab navigation | Navigate Gemini tab to specific conversation |
| `chat-inject-prompt` | Cross-frame `postMessage` | Receive prompt from iframe, inject into textarea |
| `chat-export-response` | Content script DOM extraction | Extract model response text from DOM |
| `chat-detect-theme` | Content script class detection | Detect light/dark theme |
| `chat-observe-url` | MutationObserver on document | Detect URL changes for conversation navigation |
| `chat-inject-header` | Content script DOM creation | Inject prompt attribution header |
| `chat-inject-selectors` | Content script UI injection | Inject language/tone/style selector dropdowns |
| `chat-inject-export-btns` | Content script button injection | Add export buttons to messages |

#### Category E: Meta Capabilities

Operations that orchestrate other capabilities or manage system state.

| Capability ID | Handler | Description |
|---|---|---|
| `get-state` | `getProviderState()` | Provider state overview (connected, counts, accounts) |
| `sync-provider` | `syncManager.syncProvider()` | Trigger full sync for a provider |
| `sync-conversation` | `syncManager.syncConversation()` | Sync single conversation |
| `protocol-test-suite` | `runProtocolTests()` | Full interaction cycle test (create, read, update, delete, verify) |
| `get-accounts` | `provider.detectAccounts()` + metadata | List accounts with conversation counts |
| `set-active-account` | `LiveStorage` preference | Set active account preference |
| `get-active-account` | `LiveStorage` preference | Get active account preference |
| `get-settings` | `LiveStorage` query | Get extension settings |
| `set-settings` | `LiveStorage` update | Update extension settings |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CAPABILITY REGISTRY                           │
│                        (src/capabilities/registry.ts)                 │
│                                                                      │
│  Single source of truth. All capability definitions live here.       │
│  - Capability taxonomy (core / provider / utility / bridge / meta)   │
│  - Parameter schemas (required, optional, types)                     │
│  - Return type definitions                                           │
│  - Provider capability declarations                                  │
│  - Runtime validation                                                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│      API ENGINE          │  │    HANDLER REGISTRY      │
│  (src/capabilities/      │  │  (src/capabilities/      │
│   engine.ts)             │  │   handlers.ts)           │
│                          │  │                          │
│  Unified execution layer │  │  Maps capability IDs to  │
│  - Validates capability  │  │  their handler functions │
│  - Resolves account      │  │  - Provider method calls │
│  - Routes to handler     │  │  - Utility functions     │
│  - Returns typed result  │  │  - Bridge (content script)│
└────────────┬─────────────┘  └────────────┬─────────────┘
             │                             │
    ┌────────┴────────┐           ┌────────┴────────┐
    ▼                 ▼           ▼                 ▼
┌────────┐  ┌──────────────┐  ┌────────┐  ┌──────────────┐
│Provider│  │Service Worker│  │UI Panel│  │  AI Chat     │
│Config  │  │Message Router│  │(Test)  │  │  Panel       │
│        │  │              │  │        │  │              │
│Reads   │  │Routes through│  │Generates│ │Queries for   │
│from    │  │ApiEngine only│  │from    │ │available     │
│registry│  │              │  │registry│ │capabilities  │
└────────┘  └──────────────┘  └────────┘  └──────────────┘
```

---

## 4. Data Structures

### 4.1 Capability Definition

```typescript
// src/capabilities/types.ts

export type CapabilityCategory = 'core' | 'provider' | 'utility' | 'bridge' | 'meta'

export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface CapabilityParam {
  name: string
  type: ParamType
  required: boolean
  description: string
  defaultValue?: unknown
}

export interface CapabilityDefinition {
  /** Unique identifier, e.g., 'conversation-list' */
  id: string

  /** Category determining execution strategy */
  category: CapabilityCategory

  /** Human-readable label */
  label: string

  /** Detailed description */
  description: string

  /** Provider method name (for core/provider categories) */
  providerMethod?: string

  /** chrome.runtime.sendMessage message type */
  messageType: string

  /** Whether this capability requires an authenticated account */
  requiresAccount: boolean

  /** Parameter schema */
  params: CapabilityParam[]

  /** Return type description (for documentation) */
  returnType: string

  /** Whether this is a fire-and-forget operation (no response expected) */
  isFireAndForget?: boolean

  /** Icon name for UI display */
  icon?: string
}
```

### 4.2 Provider Capability Declaration

Each provider declares which capabilities it supports:

```typescript
// In src/providers/gemini/index.ts
readonly supportedCapabilities: string[] = [
  // Core
  'conversation-list',
  'message-fetch',
  'search',
  'create-conversation',
  'edit-title',
  'delete-conversation',
  'ping',
  'get-chat-url',
  // Provider-specific
  'fetch-all-gems',
  'fetch-summary',
  'auto-sync',
  'is-offline',
  'detect-accounts',
  'refresh-auth',
  'is-authenticated',
]
```

### 4.3 Handler Function Signature

All handlers conform to a single interface:

```typescript
export interface HandlerContext {
  providerId: string
  accountId?: string
  account?: Account
  params: Record<string, unknown>
}

export type CapabilityHandler = (ctx: HandlerContext) => Promise<unknown>
```

---

## 5. Registry Design

```typescript
// src/capabilities/registry.ts

class CapabilityRegistry {
  private definitions = new Map<string, CapabilityDefinition>()
  private handlers = new Map<string, CapabilityHandler>()
  private providerCapabilities = new Map<string, Set<string>>()

  // Registration
  register(def: CapabilityDefinition): void
  registerHandler(id: string, handler: CapabilityHandler): void
  declareProviderCapability(providerId: string, capabilityId: string): void

  // Queries
  get(id: string): CapabilityDefinition | undefined
  getAll(category?: CapabilityCategory): CapabilityDefinition[]
  getForProvider(providerId: string): CapabilityDefinition[]
  hasCapability(providerId: string, capabilityId: string): boolean
  getHandler(id: string): CapabilityHandler | undefined

  // Validation
  validateParams(capabilityId: string, params: Record<string, unknown>): { valid: boolean; errors: string[] }
}

const registry = new CapabilityRegistry()

// Register all capabilities at module load
function registerAllCapabilities(): void {
  // ── Core capabilities ──
  registry.register({
    id: 'conversation-list',
    category: 'core',
    label: 'List Conversations',
    description: 'Paginated conversation list with cursor navigation',
    providerMethod: 'listConversations',
    messageType: 'TEST_LIST_CONVERSATIONS',
    requiresAccount: true,
    params: [
      { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
      { name: 'limit', type: 'number', required: false, description: 'Max results per page' },
    ],
    returnType: 'PaginatedResult<Header>',
    icon: 'Database',
  })

  registry.register({
    id: 'message-fetch',
    category: 'core',
    label: 'Fetch Conversation',
    description: 'Download full conversation with message pairs',
    providerMethod: 'getConversation',
    messageType: 'TEST_FETCH_CONTENT',
    requiresAccount: true,
    params: [
      { name: 'conversationId', type: 'string', required: true, description: 'Conversation ID' },
    ],
    returnType: 'Conversation',
    icon: 'FileText',
  })

  registry.register({
    id: 'edit-title',
    category: 'core',
    label: 'Edit Title',
    description: 'Rename a conversation',
    providerMethod: 'editTitle',
    messageType: 'TEST_EDIT_TITLE',
    requiresAccount: true,
    params: [
      { name: 'conversationId', type: 'string', required: true, description: 'Conversation ID' },
      { name: 'title', type: 'string', required: true, description: 'New title' },
    ],
    returnType: 'void',
    icon: 'Edit3',
  })

  registry.register({
    id: 'delete-conversation',
    category: 'core',
    label: 'Delete Conversation',
    description: 'Remove a conversation from the provider',
    providerMethod: 'deleteConversation',
    messageType: 'TEST_DELETE_CONVERSATION',
    requiresAccount: true,
    params: [
      { name: 'conversationId', type: 'string', required: true, description: 'Conversation ID' },
    ],
    returnType: 'void',
    icon: 'Trash2',
  })

  registry.register({
    id: 'create-conversation',
    category: 'core',
    label: 'Create Conversation',
    description: 'Start new chat with initial prompt',
    providerMethod: 'createConversation',
    messageType: 'TEST_CREATE_CONVERSATION',
    requiresAccount: true,
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Initial prompt text' },
    ],
    returnType: 'Conversation',
    icon: 'Plus',
  })

  registry.register({
    id: 'search',
    category: 'core',
    label: 'Search Conversations',
    description: 'Text search across all conversations',
    providerMethod: 'search',
    messageType: 'TEST_SEARCH',
    requiresAccount: true,
    params: [
      { name: 'query', type: 'string', required: true, description: 'Search query text' },
    ],
    returnType: 'SearchResult[]',
    icon: 'Search',
  })

  registry.register({
    id: 'ping',
    category: 'core',
    label: 'Ping / Connectivity',
    description: 'Check if provider is reachable',
    providerMethod: 'ping',
    messageType: 'TEST_PING',
    requiresAccount: true,
    params: [],
    returnType: 'boolean',
    icon: 'CheckCircle2',
  })

  registry.register({
    id: 'get-chat-url',
    category: 'core',
    label: 'Get Chat URL',
    description: 'Build provider URL for a conversation',
    providerMethod: 'getChatUrl',
    messageType: 'TEST_GET_CHAT_URL',
    requiresAccount: false,
    params: [
      { name: 'conversationId', type: 'string', required: true, description: 'Conversation ID' },
    ],
    returnType: 'string',
    icon: 'ExternalLink',
  })

  // ── Provider capabilities ──
  registry.register({
    id: 'fetch-all-gems',
    category: 'provider',
    label: 'Fetch All Gems',
    description: 'List conversations from custom Gemini assistants',
    providerMethod: 'fetchAllGems',
    messageType: 'TEST_FETCH_ALL_GEMS',
    requiresAccount: true,
    params: [],
    returnType: 'Conversation[]',
    icon: 'Database',
  })

  registry.register({
    id: 'fetch-summary',
    category: 'provider',
    label: 'Fetch Summary',
    description: 'Get AI-generated text response (temp chat)',
    providerMethod: 'summarize',
    messageType: 'TEST_FETCH_SUMMARY',
    requiresAccount: true,
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Summary prompt' },
      { name: 'systemPrompt', type: 'string', required: false, description: 'System prompt' },
    ],
    returnType: 'string',
    icon: 'Sparkles',
  })

  registry.register({
    id: 'auto-sync',
    category: 'provider',
    label: 'Auto Sync',
    description: 'Network interception for auto-sync',
    providerMethod: 'handleNetworkActivity',
    messageType: 'auto-sync',
    requiresAccount: true,
    params: [
      { name: 'details', type: 'object', required: true, description: 'RequestDetails object' },
    ],
    returnType: 'SyncTrigger | null',
    icon: 'RefreshCw',
  })

  registry.register({
    id: 'is-offline',
    category: 'provider',
    label: 'Check Offline Status',
    description: 'Verify if account is still authenticated',
    providerMethod: 'isOffline',
    messageType: 'TEST_IS_OFFLINE',
    requiresAccount: true,
    params: [
      { name: 'accountId', type: 'string', required: true, description: 'Account ID' },
    ],
    returnType: 'boolean',
    icon: 'WifiOff',
  })

  registry.register({
    id: 'detect-accounts',
    category: 'provider',
    label: 'Detect Accounts',
    description: 'Scan for authenticated accounts',
    providerMethod: 'detectAccounts',
    messageType: 'GET_ACCOUNTS',
    requiresAccount: false,
    params: [],
    returnType: 'Account[]',
    icon: 'Users',
  })

  registry.register({
    id: 'refresh-auth',
    category: 'provider',
    label: 'Refresh Auth',
    description: 'Refresh auth token for a given account',
    providerMethod: 'refreshAuth',
    messageType: 'refresh-auth',
    requiresAccount: true,
    params: [],
    returnType: 'AuthProfile | null',
    icon: 'Key',
  })

  registry.register({
    id: 'is-authenticated',
    category: 'provider',
    label: 'Is Authenticated',
    description: 'Check if account is still authenticated',
    providerMethod: 'isAuthenticated',
    messageType: 'is-authenticated',
    requiresAccount: true,
    params: [],
    returnType: 'boolean',
    icon: 'Shield',
  })

  // ── Utility capabilities ──
  registry.register({
    id: 'download-raw',
    category: 'utility',
    label: 'Download Raw Data',
    description: 'Download N most recent conversations with raw API response, parsed messages, and media',
    messageType: 'TEST_DOWNLOAD_RAW',
    requiresAccount: true,
    params: [
      { name: 'count', type: 'number', required: false, description: 'Number of conversations (default: 1)' },
      { name: 'conversationId', type: 'string', required: false, description: 'Specific conversation ID' },
    ],
    returnType: '{ conversations: Array<{header, parsedMessages, rawApiResponse, media}> }',
    icon: 'Database',
  })

  registry.register({
    id: 'deobfuscate',
    category: 'utility',
    label: 'Deobfuscate Raw API',
    description: 'Analyze raw response and produce complete field taxonomy',
    messageType: 'TEST_DEOBFUSCATE',
    requiresAccount: true,
    params: [
      { name: 'count', type: 'number', required: false, description: 'Number of conversations (default: 1)' },
      { name: 'conversationId', type: 'string', required: false, description: 'Specific conversation ID' },
    ],
    returnType: '{ conversations: Array<{header, parsedMessages, rawApiResponse, media}> }',
    icon: 'Sparkles',
  })

  registry.register({
    id: 'download-media',
    category: 'utility',
    label: 'Download Media',
    description: 'Extract and download all media from a conversation',
    messageType: 'TEST_DOWNLOAD_MEDIA',
    requiresAccount: true,
    params: [
      { name: 'conversationId', type: 'string', required: true, description: 'Conversation ID' },
    ],
    returnType: '{ conversationId: string, media: Array<{url}> }',
    icon: 'Image',
  })

  registry.register({
    id: 'sync-missing',
    category: 'utility',
    label: 'Sync Missing from Search',
    description: 'Download conversations not in local DB',
    messageType: 'TEST_SYNC_MISSING',
    requiresAccount: true,
    params: [
      { name: 'searchResults', type: 'array', required: true, description: 'Search result IDs' },
    ],
    returnType: 'number',
    icon: 'RefreshCw',
  })

  registry.register({
    id: 'get-all-headers',
    category: 'utility',
    label: 'Get All Headers',
    description: 'Get all conversation headers for a service',
    messageType: 'GET_ALL_HEADERS',
    requiresAccount: false,
    params: [
      { name: 'serviceId', type: 'string', required: true, description: 'Service ID' },
      { name: 'accountId', type: 'string', required: false, description: 'Account ID filter' },
    ],
    returnType: 'Header[]',
    icon: 'List',
  })

  registry.register({
    id: 'fetch-media-base64',
    category: 'utility',
    label: 'Fetch Media as Base64',
    description: 'Convert remote media URLs to base64 for download',
    messageType: 'FETCH_MEDIA_AS_BASE64',
    requiresAccount: false,
    params: [
      { name: 'urls', type: 'array', required: true, description: 'Array of media URLs' },
    ],
    returnType: 'Array<{url, dataUrl?, error?}>',
    icon: 'Download',
  })

  registry.register({
    id: 'get-rate-limit-status',
    category: 'utility',
    label: 'Rate Limit Status',
    description: 'Check if provider is rate-limited',
    messageType: 'GET_RATE_LIMIT_STATUS',
    requiresAccount: false,
    params: [],
    returnType: '{ isRateLimited: boolean, serviceId: string }',
    icon: 'AlertTriangle',
  })

  // ── Bridge capabilities ──
  registry.register({
    id: 'chat-send',
    category: 'bridge',
    label: 'Send Chat Message',
    description: 'Inject prompt into Gemini textarea and click send',
    messageType: 'chat-send',
    requiresAccount: true,
    params: [
      { name: 'text', type: 'string', required: true, description: 'Prompt text' },
      { name: 'conversationId', type: 'string', required: false, description: 'Existing conversation ID' },
    ],
    returnType: 'void',
    icon: 'Send',
  })

  registry.register({
    id: 'chat-read-ui',
    category: 'bridge',
    label: 'Read Chat UI State',
    description: 'Read model selection, active tools from Gemini UI',
    messageType: 'chat-read-ui',
    requiresAccount: false,
    params: [],
    returnType: '{ model: string, tools: string[] }',
    icon: 'Eye',
  })

  registry.register({
    id: 'chat-navigate',
    category: 'bridge',
    label: 'Navigate Chat',
    description: 'Navigate Gemini tab to specific conversation',
    messageType: 'chat-navigate',
    requiresAccount: false,
    params: [
      { name: 'conversationId', type: 'string', required: true, description: 'Conversation ID' },
    ],
    returnType: 'void',
    icon: 'Navigation',
  })

  registry.register({
    id: 'chat-inject-prompt',
    category: 'bridge',
    label: 'Inject Prompt',
    description: 'Receive prompt from iframe, inject into textarea',
    messageType: 'chat-inject-prompt',
    requiresAccount: false,
    params: [
      { name: 'text', type: 'string', required: true, description: 'Prompt text' },
    ],
    returnType: 'void',
    icon: 'FileInput',
  })

  registry.register({
    id: 'chat-export-response',
    category: 'bridge',
    label: 'Export Response',
    description: 'Extract model response text from DOM',
    messageType: 'chat-export-response',
    requiresAccount: false,
    params: [],
    returnType: 'string',
    icon: 'FileOutput',
  })

  registry.register({
    id: 'chat-detect-theme',
    category: 'bridge',
    label: 'Detect Theme',
    description: 'Detect light/dark theme on Gemini page',
    messageType: 'chat-detect-theme',
    requiresAccount: false,
    params: [],
    returnType: '"light" | "dark"',
    icon: 'Palette',
  })

  // ── Meta capabilities ──
  registry.register({
    id: 'get-state',
    category: 'meta',
    label: 'Get Provider State',
    description: 'Provider state overview (connected, counts, accounts)',
    messageType: 'GET_STATE',
    requiresAccount: false,
    params: [],
    returnType: 'Array<ProviderState>',
    icon: 'Activity',
  })

  registry.register({
    id: 'sync-provider',
    category: 'meta',
    label: 'Sync Provider',
    description: 'Trigger full sync for a provider',
    messageType: 'SYNC_PROVIDER',
    requiresAccount: true,
    params: [],
    returnType: '{ ok: boolean }',
    isFireAndForget: true,
    icon: 'RefreshCw',
  })

  registry.register({
    id: 'sync-conversation',
    category: 'meta',
    label: 'Sync Conversation',
    description: 'Sync single conversation',
    messageType: 'SYNC_CONVERSATION',
    requiresAccount: true,
    params: [
      { name: 'conversationId', type: 'string', required: true, description: 'Conversation ID' },
    ],
    returnType: '{ ok: boolean }',
    isFireAndForget: true,
    icon: 'RefreshCw',
  })

  registry.register({
    id: 'protocol-test-suite',
    category: 'meta',
    label: 'Protocol Test Suite',
    description: 'Full interaction cycle test — create, read, update, delete, verify',
    messageType: 'TEST_PROTOCOL_SUITE',
    requiresAccount: true,
    params: [],
    returnType: 'ProtocolTestReport',
    icon: 'TestTube',
  })

  registry.register({
    id: 'set-active-account',
    category: 'meta',
    label: 'Set Active Account',
    description: 'Set active account preference',
    messageType: 'SET_ACTIVE_ACCOUNT',
    requiresAccount: false,
    params: [
      { name: 'accountId', type: 'string', required: true, description: 'Account ID' },
    ],
    returnType: '{ ok: boolean }',
    icon: 'UserCheck',
  })

  registry.register({
    id: 'get-active-account',
    category: 'meta',
    label: 'Get Active Account',
    description: 'Get active account preference',
    messageType: 'GET_ACTIVE_ACCOUNT',
    requiresAccount: false,
    params: [],
    returnType: 'string',
    icon: 'User',
  })

  registry.register({
    id: 'get-settings',
    category: 'meta',
    label: 'Get Settings',
    description: 'Get extension settings',
    messageType: 'GET_SETTINGS',
    requiresAccount: false,
    params: [],
    returnType: 'Record<string, unknown>',
    icon: 'Settings',
  })

  registry.register({
    id: 'set-settings',
    category: 'meta',
    label: 'Set Settings',
    description: 'Update extension settings',
    messageType: 'SET_SETTINGS',
    requiresAccount: false,
    params: [
      { name: 'settings', type: 'object', required: true, description: 'Settings object' },
    ],
    returnType: '{ ok: boolean }',
    icon: 'Settings',
  })

  // ── Register handlers ──
  // Core handlers delegate to provider methods
  registry.registerHandler('conversation-list', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
    return provider.listConversations(ctx.account!, ctx.params.cursor, ctx.params.limit)
  })

  registry.registerHandler('message-fetch', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
    return provider.getConversation(ctx.account!, ctx.params.conversationId as string)
  })

  registry.registerHandler('edit-title', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider?.editTitle) throw new Error('editTitle not supported')
    return provider.editTitle(ctx.account!, ctx.params.conversationId as string, ctx.params.title as string)
  })

  registry.registerHandler('delete-conversation', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider?.deleteConversation) throw new Error('deleteConversation not supported')
    return provider.deleteConversation(ctx.account!, ctx.params.conversationId as string)
  })

  registry.registerHandler('create-conversation', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider?.createConversation) throw new Error('createConversation not supported')
    return provider.createConversation(ctx.account!, ctx.params.prompt as string)
  })

  registry.registerHandler('search', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
    return provider.search(ctx.account!, ctx.params.query as string)
  })

  registry.registerHandler('ping', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
    return provider.ping(ctx.account!)
  })

  registry.registerHandler('get-chat-url', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider) throw new Error(`Provider not found: ${ctx.providerId}`)
    const header = await idb.headers.get(ctx.params.conversationId as string)
    if (!header) throw new Error('Conversation not found')
    return provider.getChatUrl(header)
  })

  // Provider-specific handlers
  registry.registerHandler('fetch-all-gems', async (ctx) => {
    const { fetchAllGems } = await import('../src/providers/gemini/index')
    return fetchAllGems(ctx.account!)
  })

  registry.registerHandler('fetch-summary', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (!provider?.summarize) throw new Error('summarize not supported')
    return provider.summarize(ctx.account!, ctx.params.prompt as string, ctx.params.systemPrompt as string | undefined)
  })

  registry.registerHandler('is-offline', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    return (provider as any).isOffline(ctx.params.accountId as string)
  })

  // Utility handlers (moved from service_worker.ts)
  registry.registerHandler('download-raw', async (ctx) => {
    // Existing logic from handleCapabilityTest case 'TEST_DOWNLOAD_RAW'
    const count = (ctx.params.count as number) || 1
    const specificConvId = ctx.params.conversationId as string | null
    // ... full implementation
  })

  registry.registerHandler('deobfuscate', async (ctx) => {
    // Reuses download-raw logic, adds taxonomy analysis
    const count = (ctx.params.count as number) || 1
    const specificConvId = ctx.params.conversationId as string | null
    // ... full implementation
  })

  registry.registerHandler('download-media', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    const conversation = await provider.getConversation(ctx.account!, ctx.params.conversationId as string)
    if (!conversation) throw new Error('Conversation not found')
    const { extractMediaFromMessages, extractMediaItemsFromRaw } = await import('../sidepanel/lib/media-extract')
    const messages = conversation.messages || []
    const mediaFromMessages = extractMediaFromMessages(messages)
    const mediaFromRaw = extractMediaItemsFromRaw(messages as any[])
    const allMedia = [...mediaFromMessages, ...mediaFromRaw]
    const seen = new Set<string>()
    const uniqueMedia = allMedia.filter(m => {
      if (seen.has(m.url)) return false
      seen.add(m.url)
      return true
    })
    return { conversationId: conversation.id, media: uniqueMedia }
  })

  registry.registerHandler('sync-missing', async (ctx) => {
    const { syncMissingFromSearch } = await import('../src/providers/gemini/index')
    return syncMissingFromSearch(ctx.params.searchResults as any[], ctx.account!)
  })

  registry.registerHandler('get-all-headers', async (ctx) => {
    const serviceId = ctx.params.serviceId as string
    const accountId = ctx.params.accountId as string | undefined
    return idb.headers
      .filter((h: any) => {
        if (h.serviceId !== serviceId) return false
        if (accountId) return h.accountId === accountId || h.accountId === '' || !h.accountId
        return true
      })
      .reverse()
      .toArray()
  })

  registry.registerHandler('fetch-media-base64', async (ctx) => {
    const urls: string[] = ctx.params.urls as string[]
    const results: Array<{ url: string; dataUrl?: string; error?: string }> = []
    for (const url of urls) {
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const arrayBuffer = await resp.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        const binary = bytes.reduce((acc, b) => acc + String.fromCharCode(b), '')
        const base64 = btoa(binary)
        const contentType = resp.headers.get('content-type') || 'image/png'
        const ext = contentType.split('/')[1]?.split(';')[0] || 'png'
        const dataUrl = `data:${contentType};base64,${base64}`
        results.push({ url, dataUrl, ext })
      } catch (e: any) {
        results.push({ url, error: e.message })
      }
    }
    return results
  })

  registry.registerHandler('get-rate-limit-status', async (ctx) => {
    const state = await idb.services.get('gemini')
    return { isRateLimited: state?.isRateLimited || false, serviceId: 'gemini' }
  })

  // Meta handlers
  registry.registerHandler('get-state', async () => {
    return getProviderState()
  })

  registry.registerHandler('sync-provider', async (ctx) => {
    const provider = getProvider(ctx.providerId)
    if (provider) {
      const accounts = await provider.detectAccounts()
      const targetAccount = ctx.accountId
        ? accounts.find(a => a.id === ctx.accountId)
        : accounts[0]
      if (targetAccount) {
        syncManager.syncProvider(provider, targetAccount)
      }
    }
    return { ok: true }
  })

  registry.registerHandler('set-active-account', async (ctx) => {
    await LiveStorage.set('settings.accounts.activeId', ctx.params.accountId || '')
    return { ok: true }
  })

  registry.registerHandler('get-active-account', async () => {
    return LiveStorage.get({ 'settings.accounts.activeId': '' })
  })

  registry.registerHandler('get-settings', async () => {
    return LiveStorage.get({
      'settings.general.manualSync': LiveStorage.defaultValue,
      'settings.rateLimit.minGapMs': 1000,
      'settings.rateLimit.autoResetMs': 300000,
    })
  })

  registry.registerHandler('set-settings', async (ctx) => {
    const promises = Object.entries(ctx.params.settings as Record<string, unknown>).map(([key, value]) =>
      LiveStorage.set(key, value)
    )
    await Promise.all(promises)
    return { ok: true }
  })

  // ── Declare provider capabilities ──
  // Gemini
  registry.declareProviderCapability('gemini', 'conversation-list')
  registry.declareProviderCapability('gemini', 'message-fetch')
  registry.declareProviderCapability('gemini', 'search')
  registry.declareProviderCapability('gemini', 'create-conversation')
  registry.declareProviderCapability('gemini', 'edit-title')
  registry.declareProviderCapability('gemini', 'delete-conversation')
  registry.declareProviderCapability('gemini', 'ping')
  registry.declareProviderCapability('gemini', 'get-chat-url')
  registry.declareProviderCapability('gemini', 'fetch-all-gems')
  registry.declareProviderCapability('gemini', 'fetch-summary')
  registry.declareProviderCapability('gemini', 'auto-sync')
  registry.declareProviderCapability('gemini', 'is-offline')
  registry.declareProviderCapability('gemini', 'detect-accounts')
  registry.declareProviderCapability('gemini', 'refresh-auth')
  registry.declareProviderCapability('gemini', 'is-authenticated')

  // OpenAI (stub — expand as implementation progresses)
  registry.declareProviderCapability('openai', 'conversation-list')
  registry.declareProviderCapability('openai', 'message-fetch')
  registry.declareProviderCapability('openai', 'search')
  registry.declareProviderCapability('openai', 'create-conversation')
  registry.declareProviderCapability('openai', 'edit-title')
  registry.declareProviderCapability('openai', 'delete-conversation')
  registry.declareProviderCapability('openai', 'ping')
  registry.declareProviderCapability('openai', 'get-chat-url')
  registry.declareProviderCapability('openai', 'detect-accounts')
  registry.declareProviderCapability('openai', 'refresh-auth')
  registry.declareProviderCapability('openai', 'is-authenticated')

  // Claude (stub — expand as implementation progresses)
  registry.declareProviderCapability('claude', 'conversation-list')
  registry.declareProviderCapability('claude', 'message-fetch')
  registry.declareProviderCapability('claude', 'search')
  registry.declareProviderCapability('claude', 'create-conversation')
  registry.declareProviderCapability('claude', 'edit-title')
  registry.declareProviderCapability('claude', 'delete-conversation')
  registry.declareProviderCapability('claude', 'ping')
  registry.declareProviderCapability('claude', 'get-chat-url')
  registry.declareProviderCapability('claude', 'detect-accounts')
  registry.declareProviderCapability('claude', 'refresh-auth')
  registry.declareProviderCapability('claude', 'is-authenticated')
}
```

---

## 6. API Engine Design

```typescript
// src/capabilities/engine.ts

class ApiEngine {
  constructor(private registry: CapabilityRegistry) {}

  /**
   * Execute a capability. Validates existence, provider support, params,
   * resolves account, and routes to the correct handler.
   */
  async execute(params: ExecuteParams): Promise<unknown> {
    const { providerId, capabilityId, accountId, ...capabilityParams } = params

    // 1. Validate capability exists
    const def = this.registry.get(capabilityId)
    if (!def) throw new Error(`Unknown capability: ${capabilityId}`)

    // 2. Validate provider supports it (skip for utility/meta that don't require provider)
    if (def.category === 'core' || def.category === 'provider') {
      if (!this.registry.hasCapability(providerId, capabilityId)) {
        throw new Error(`Provider ${providerId} does not support capability: ${capabilityId}`)
      }
    }

    // 3. Validate parameters
    const validation = this.registry.validateParams(capabilityId, capabilityParams)
    if (!validation.valid) {
      throw new Error(`Invalid params for ${capabilityId}: ${validation.errors.join(', ')}`)
    }

    // 4. Resolve account if required
    let account: Account | undefined
    if (def.requiresAccount) {
      const provider = getProvider(providerId)
      if (!provider) throw new Error(`Provider not found: ${providerId}`)
      const accounts = await provider.detectAccounts()
      account = accountId
        ? accounts.find(a => a.id === accountId)
        : accounts[0]
      if (!account) throw new Error('No authenticated account found')
    }

    // 5. Get and execute handler
    const handler = this.registry.getHandler(capabilityId)
    if (!handler) throw new Error(`No handler registered for: ${capabilityId}`)

    return handler({
      providerId,
      accountId,
      account,
      params: capabilityParams,
    })
  }
}

interface ExecuteParams {
  providerId: string
  capabilityId: string
  accountId?: string
  [key: string]: unknown
}

const engine = new ApiEngine(registry)
```

---

## 7. Service Worker Integration

Replaces the entire `handleCapabilityTest()` switch (~200 lines) AND all individual message handlers with a single router:

```typescript
// background/service_worker.ts

import { engine } from '../src/capabilities/engine'
import { registry } from '../src/capabilities/registry'

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // All capability executions route through the engine
  if (message.type === 'CAPABILITY_EXECUTE') {
    engine.execute(message).then(sendResponse).catch(e => sendResponse({ error: e.message }))
    return true
  }

  // Backward compatibility: map ALL legacy message types to capability IDs
  const legacyMap: Record<string, string> = {
    // Core
    'TEST_LIST_CONVERSATIONS': 'conversation-list',
    'TEST_FETCH_CONTENT': 'message-fetch',
    'TEST_EDIT_TITLE': 'edit-title',
    'EDIT_TITLE': 'edit-title',
    'TEST_DELETE_CONVERSATION': 'delete-conversation',
    'DELETE_CONVERSATION': 'delete-conversation',
    'TEST_CREATE_CONVERSATION': 'create-conversation',
    'TEST_SEARCH': 'search',
    'TEST_PING': 'ping',
    'TEST_GET_CHAT_URL': 'get-chat-url',
    // Provider
    'TEST_FETCH_SUMMARY': 'fetch-summary',
    'TEST_FETCH_ALL_GEMS': 'fetch-all-gems',
    'TEST_IS_OFFLINE': 'is-offline',
    'GET_ACCOUNTS': 'detect-accounts',
    // Utility
    'TEST_SYNC_MISSING': 'sync-missing',
    'TEST_DOWNLOAD_RAW': 'download-raw',
    'TEST_DEOBFUSCATE': 'deobfuscate',
    'TEST_DOWNLOAD_MEDIA': 'download-media',
    'GET_ALL_HEADERS': 'get-all-headers',
    'FETCH_MEDIA_AS_BASE64': 'fetch-media-base64',
    'GET_RATE_LIMIT_STATUS': 'get-rate-limit-status',
    // Meta
    'GET_STATE': 'get-state',
    'SYNC_PROVIDER': 'sync-provider',
    'SYNC_CONVERSATION': 'sync-conversation',
    'SET_ACTIVE_ACCOUNT': 'set-active-account',
    'GET_ACTIVE_ACCOUNT': 'get-active-account',
    'GET_SETTINGS': 'get-settings',
    'SET_SETTINGS': 'set-settings',
  }

  const capabilityId = legacyMap[message.type]
  if (capabilityId) {
    engine.execute({ ...message, capabilityId }).then(sendResponse).catch(e => sendResponse({ error: e.message }))
    return true
  }

  // Non-routed messages (future: remove as everything moves to engine)
  // Currently: network interception, tab management, etc.
})
```

**Benefits:**
- Single execution path — all capability calls go through `engine.execute()`
- Validation happens automatically — unknown capabilities, unsupported-by-provider, invalid params all throw
- Adding a new capability = register definition + register handler. No switch case edits.
- Backward compatible — ALL existing message types still work via the legacy map
- Fire-and-forget operations (`sync-provider`, `sync-conversation`) are properly flagged with `isFireAndForget: true`

---

## 8. UI Integration

### 8.1 CapabilitiesPanel (Test Harness)

Generates its UI dynamically from the registry:

```typescript
// sidepanel/components/CapabilitiesPanel.tsx

import { registry } from '@/capabilities/registry'
import { engine } from '@/capabilities/engine'

const capabilities = registry.getAll()  // All capabilities, or filter by category

// Each card gets its form fields from capability.params
function CapabilityCard({ cap }: { cap: CapabilityDefinition }) {
  const { activeProvider, activeAccountId } = useAppStore()

  async function runTest() {
    const result = await engine.execute({
      providerId: activeProvider,
      capabilityId: cap.id,
      accountId: activeAccountId || undefined,
      ...formValues,
    })
    setResult(result)
  }

  // Render form fields from cap.params
  return (
    <Card>
      {cap.params.map(param => (
        <div key={param.name}>
          <Label>{param.name} {param.required ? '*' : ''}</Label>
          <Input placeholder={param.description} />
        </div>
      ))}
      <Button onClick={runTest}>Run</Button>
    </Card>
  )
}
```

### 8.2 OverviewPanel

Shows actual supported capabilities instead of hardcoded provider config:

```typescript
// sidepanel/components/OverviewPanel.tsx

import { registry } from '@/capabilities/registry'

// Get what this provider actually supports
const supportedCaps = registry.getForProvider(p.id)

{supportedCaps.map(cap => (
  <Badge key={cap.id} variant="secondary">{cap.label}</Badge>
))}
```

### 8.3 AI Chat Panel

Queries registry at runtime:

```typescript
// sidepanel/stores/chatStore.ts

import { registry } from '@/capabilities/registry'
import { engine } from '@/capabilities/engine'

// Check if chat-send (bridge) is available
const hasBridge = registry.hasCapability('gemini', 'chat-send')

// Use engine for all operations
async function sendMessage(providerId, accountId, text) {
  if (hasBridge) {
    // Use content-script bridge for true multi-turn
    await engine.execute({
      providerId,
      capabilityId: 'chat-send',
      accountId,
      text,
      conversationId: activeConversationId,
    })
  } else {
    // Fallback to create-conversation
    await engine.execute({
      providerId,
      capabilityId: 'create-conversation',
      accountId,
      prompt: text,
    })
  }
}
```

---

## 9. File Structure

```
src/capabilities/
├── types.ts              # CapabilityDefinition, CapabilityParam, HandlerContext, etc.
├── definitions.ts        # All capability definitions (the registry data)
├── handlers.ts           # All handler implementations (provider calls + utilities + bridge)
├── registry.ts           # CapabilityRegistry class + singleton instance
├── engine.ts             # ApiEngine class + singleton instance
└── index.ts              # Public exports: registry, engine, types

Changes to existing files:
├── src/types.ts          # Remove ProviderCapabilityType union (replaced by registry)
├── src/providers/provider-interface.ts  # Remove hasCapability() — registry owns this
├── src/providers/gemini/index.ts        # Replace config.capabilities with supportedCapabilities string[]
├── src/providers/openai/index.ts        # Same
├── src/providers/claude/index.ts        # Same
├── src/providers/provider-registry.ts   # Remove getProvidersWithCapability() — registry owns this
├── src/sync-manager.ts   # Use registry.hasCapability() instead of provider.hasCapability()
├── background/service_worker.ts  # Replace ALL message handlers with engine.execute() routing
├── sidepanel/components/CapabilitiesPanel.tsx  # Generate from registry
├── sidepanel/components/OverviewPanel.tsx       # Read from registry
├── sidepanel/stores/chatStore.ts                # Use engine.execute()
├── sidepanel/stores/appStore.ts                 # Remove testResults (no longer needed)
└── sidepanel/lib/messaging.ts                   # Update testCapability() to use CAPABILITY_EXECUTE
```

---

## 10. Migration Plan

### Phase 1: Build the Engine (no breaking changes)
- Create `src/capabilities/` with all types, definitions, handlers, registry, engine
- Register all existing capabilities with their current behavior
- Keep existing `handleCapabilityTest()` switch active
- Keep existing direct message handlers (`GET_STATE`, `SYNC_PROVIDER`, etc.) active

### Phase 2: Dual-Run (validation)
- Wire service worker to route through engine
- Keep legacy message type → engine mapping active
- Run protocol test suite — all 19 tests must pass identically
- Verify fire-and-forget operations work correctly

### Phase 3: Cleanup (breaking changes)
- Remove `handleCapabilityTest()` switch
- Remove `ProviderCapability` interface and `config.capabilities` from providers
- Replace `provider.hasCapability()` calls with `registry.hasCapability()`
- Remove `getProvidersWithCapability()` from provider-registry
- Update CapabilitiesPanel to generate from registry
- Update OverviewPanel to read from registry
- Remove all individual message handlers from service worker (replaced by engine routing)

### Phase 4: New Capabilities
- Add `chat-send`, `chat-read-ui`, `chat-navigate` bridge capabilities
- AI Chat panel uses engine for all operations
- Content script bridge implementation

---

## 11. Provider Expansion Pattern

When adding a new provider (e.g., fully implementing OpenAI):

```typescript
// src/providers/openai/index.ts

export class OpenAIProvider implements ConversationProvider {
  readonly id = 'openai'
  readonly name = 'ChatGPT'

  // Declare which capabilities this provider supports
  readonly supportedCapabilities: string[] = [
    'conversation-list',
    'message-fetch',
    'search',
    'create-conversation',
    'edit-title',
    'delete-conversation',
    'ping',
    'get-chat-url',
    // OpenAI-specific capabilities would be registered in definitions.ts
  ]

  // Implement the methods — the engine's handlers call these
  async listConversations(account, cursor?, limit?) { ... }
  async getConversation(account, conversationId) { ... }
  // ...
}

// src/capabilities/handlers.ts
// The existing 'conversation-list' handler already calls provider.listConversations()
// No handler changes needed — just register the provider's supported capabilities

// src/capabilities/definitions.ts
registry.declareProviderCapability('openai', 'conversation-list')
registry.declareProviderCapability('openai', 'message-fetch')
// ...
```

**Zero handler changes needed** for core capabilities — the handlers call the provider interface methods, which every provider implements. Only provider-specific and bridge capabilities need new handlers.

---

## 12. Runtime Behavior

### Capability Execution Flow

```
UI calls engine.execute({ providerId: 'gemini', capabilityId: 'create-conversation', prompt: 'hello' })
  │
  ├─► registry.get('create-conversation')
  │     → Returns CapabilityDefinition
  │     → validates params: { prompt: string } ✓
  │
  ├─► registry.hasCapability('gemini', 'create-conversation')
  │     → true ✓
  │
  ├─► Resolve account
  │     → provider.detectAccounts() → accounts[0]
  │
  ├─► registry.getHandler('create-conversation')
  │     → Returns: (ctx) => ctx.provider.createConversation(ctx.account, ctx.params.prompt)
  │
  └─► Execute handler
        → GeminiProvider.createConversation(account, 'hello')
        → StreamGenerate POST
        → Returns { id, response }
```

### Error Cases

| Scenario | Error |
|---|---|
| Unknown capability ID | `Unknown capability: xyz` |
| Provider doesn't support capability | `Provider gemini does not support capability: xyz` |
| Missing required param | `Invalid params for create-conversation: prompt is required` |
| No authenticated account | `No authenticated account found` |
| Handler throws | Propagates the provider's error |

---

## 13. What This Enables for AI Chat

Once the engine is in place, the AI Chat panel can:

1. **Query available capabilities at runtime:**
   ```typescript
   const caps = registry.getForProvider('gemini')
   const canChat = registry.hasCapability('gemini', 'chat-send')
   const canCreate = registry.hasCapability('gemini', 'create-conversation')
   ```

2. **Graceful degradation:**
   ```typescript
   if (canChat) {
     // Use content-script bridge for true multi-turn
     engine.execute({ capabilityId: 'chat-send', ... })
   } else if (canCreate) {
     // Fallback to new conversation each time
     engine.execute({ capabilityId: 'create-conversation', ... })
   } else {
     // Show "not supported" UI
   }
   ```

3. **Future-proof:** When OpenAI/Claude get their bridge capabilities implemented, the AI Chat panel automatically supports them — no code changes needed, just register the new capability.

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Registry becomes a god object | Split into definitions.ts (data), handlers.ts (logic), registry.ts (lookup), engine.ts (execution) |
| Handler registration order matters | Registry validates all registrations at init time, throws on duplicates |
| Legacy message types cause confusion | Phase 3 removes the legacy map entirely — clean break |
| Performance overhead of validation | Validation is O(n) on small param arrays (~5 params max) — negligible |
| TypeScript type safety across dynamic params | CapabilityParam schema provides runtime validation; TypeScript types document expected shapes |
| Bridge capabilities require content script | Bridge handlers use `chrome.tabs.sendMessage` — graceful fallback if content script not loaded |
| Fire-and-forget operations lose response | `isFireAndForget` flag tells engine to not wait for response |

---

## 15. Success Criteria

- [ ] All 19 protocol tests pass identically after migration
- [ ] Adding a new capability requires edits in exactly 2 files (definitions.ts + handlers.ts)
- [ ] `hasCapability()` returns accurate results for all provider/capability combinations
- [ ] Service worker has zero inline capability logic — all routed through engine
- [ ] CapabilitiesPanel generates its entire UI from registry data
- [ ] AI Chat panel can query capabilities at runtime and adapt behavior
- [ ] All 29 message types (TEST_*, GET_*, SET_*, SYNC_*, etc.) route through engine via legacy map
- [ ] Fire-and-forget operations (`sync-provider`, `sync-conversation`) properly flagged and handled
- [ ] Bridge capabilities (`chat-send`, `chat-read-ui`, etc.) registered and functional
