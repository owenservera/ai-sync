# Gemini Service Adapter — Features & Capabilities

> Reconstructed from the original minified extension bundle (module key `4tthb`, lines 4602–4605).
> This is the **Gemini-specific service adapter** — one piece of a larger extension that manages conversations across multiple AI platforms.

---

## 1. Core Purpose

A **service adapter** that lets the parent extension read, write, sync, and manage Gemini conversations as if they were local data. It wraps Gemini's internal RPC APIs (batchexecute/StreamGenerate) behind a clean `ServiceDefinition` interface that the rest of the extension consumes uniformly.

---

## 2. Conversation Operations

### 2.1 List Conversations (`fetchHeaders`)
- **What**: Fetch a paginated list of all conversations for an account/organization.
- **Pagination**: Supports cursor-based pagination (the API returns a `next` cursor string).
- **Batch size**: Dynamically adaptive — starts at 100, adjusts to the actual page size returned.
- **Hard cap**: Max 500 conversations total (`maxLimit: 500`).
- **Auto-retry on 401/400**: If the server rejects with a 400 status, the function automatically refreshes the auth token and retries once.
- **Navigation**: Push-to-refresh — calling `fetchHeaders` repeatedly with cursors walks forward through the entire conversation list.

### 2.2 Fetch Full Conversation (`fetchContent`)
- **What**: Download ALL messages for a single conversation.
- **Internal pagination**: Uses hNvQHb RPC with cursor-based page traversal, up to **50 pages** max.
- **Message parsing**: Converts raw API response arrays into structured `{ user, assistant }` message pairs.
- **Resilience**: Returns `null` silently if the conversation is truly empty (no messages on first page). Throws on structural errors.

### 2.3 Edit Title (`edit`)
- **What**: Rename a conversation.
- **How**: Calls `MUAZcd` RPC with the new title.
- **Auth auto-refresh**: If no token is cached, fetches a fresh one automatically.
- **Requires**: Account lookup from the conversation's `accountId`.

### 2.4 Delete Conversation (`delete`)
- **What**: Delete a conversation from Gemini's servers.
- **How**: Calls `GzXR5e` RPC with the conversation ID.
- **Same auth pattern**: Auto-refresh on missing token.

### 2.5 Create Conversation (`createConversation`)
- **What**: Start a new conversation with an initial prompt.
- **How**: Uses `StreamGenerate` endpoint (the streaming endpoint, not batchexecute).
- **Returns**: The new conversation's ID and the model's first response text.
- **Network error handling**: Detects `networkError` / `offline` flags in the response.
- **Auth**: Requires a fresh token (fetches profile first).

### 2.6 Fetch Summary / AI Prompt (`fetchSummary`)
- **What**: Send a prompt to Gemini's model and get a text response (for summarization features).
- **How**: Creates a temporary conversation via `createConversation`, then immediately **deletes** it (cleanup).
- **System prompt support**: Prepends an optional system prompt to the user prompt.
- **Active org selection**: Reads the active org ID from `LiveStorage` settings (`settings.summary.orgId`).

### 2.7 Fetch All Gems (`fetchAllGems`)
- **What**: Fetch conversations belonging to custom **Gems** (custom Gemini assistants).
- **How two-step**:
  1. Fetch all Gem definitions via `CNgdBe` RPC (name-to-ID mapping).
  2. Paginate through the conversation list via `MaZiqc` RPC, filtering for entries that have a `gemId` (column index 7).
- **Gem name resolution**: Matches `gemId` from step 1 to display names in the results.
- **Safety cap**: 10 page max to prevent runaway pagination.

### 2.8 Search Conversations (`searchGeminiConversations`)
- **What**: Search Gemini conversations by text query.
- **How**: Calls `unqWSc` RPC with the query string.
- **Returns**: Parsed array of `{ id, title, updated }` results.
- **Empty guard**: Rejects empty/whitespace-only queries.
- **Auth auto-refresh**: Standard token refresh pattern.

### 2.9 Sync Missing from Search (`syncMissingFromSearch`)
- **What**: After searching, find conversations that exist on the server but are NOT in the local database, then download them.
- **How**: Compares search result IDs against local `idb.headers`, finds the delta, then for each missing item:
  1. Saves a header entry to `idb.headers`.
  2. Downloads full conversation content via `fetchContent`.
  3. Saves messages to `idb.conversations`.
- **Progress callback**: Optional `(current, total) => void` for UI progress bars.
- **Cache update**: Calls `idb.orgs.updateCounts()` after syncing.
- **Partial failure**: Individual conversation failures are logged and skipped (doesn't abort the batch).

---

## 3. Auth & Account Management

### 3.1 Token Refresh (`fetchProfile`)
- **What**: Fetch the `SNlM0e` auth token from Gemini's profile page HTML.
- **How**: Fetches `https://gemini.google.com/app` (or `/u/{index}/app` for multi-account), then extracts `"SNlM0e":"<token>"` via regex.
- **Cache**: 3-minute in-memory TTL (`profileCache`).
- **Multi-account**: Supports user index (0, 1, 2, ...) for users with multiple Google accounts.
- **Profile info extraction**: Also extracts user ID (`S06Grb`), name, and email from the page HTML.

### 3.2 Account Detection (`onGoogleAccountFetch`)
- **What**: When the extension detects a new Google account login on Gemini, this creates the local account + org records.
- **How**: Reads the `SID` cookie for `gemini.google.com`, then creates/updates records in `idb.accounts` and `idb.orgs`.
- **Duplicate detection**: If an account with the same email exists under a different ID, it **migrates** — deletes the old org/account and creates new ones.
- **Idempotent**: If the account already exists with the same ID, touches nothing.

### 3.3 Offline Detection (`isOffline`)
- **What**: Checks whether a given account is still authenticated.
- **How**: Fetches the profile page and compares the email from the profile against the stored account email.
- **Returns**: `true` if the account's email changed or the profile can't be fetched (user signed out).

### 3.4 Ping / Connectivity Check (`ping`)
- **What**: Simple reachability check — can we get a valid `SNlM0e` token for this account?
- **How**: Calls `fetchProfile`, returns success if a token was extracted.
- **Throws on failure**: Lets the caller know the provider is unreachable.

---

## 4. Network Interception & Auto-Sync

### 4.1 Request Interceptor (`onFetch`)
- **What**: The extension interceptor hooks ALL network requests to `gemini.google.com` and decides whether to auto-trigger a sync.
- **Token harvesting**: Extracts the `at` (auth token) from intercepted request bodies. Fills in `idb.accounts.token` for any accounts missing it.
- **Gem conversation caching**: When a `MaZiqc` (conversation list) response is intercepted, caches the list of Gem-type conversations to `chrome.storage.local` for quick access.

### 4.2 Request Classification
The interceptor categorizes every request:

| RPC ID | Meaning | Sync Trigger? |
|--------|---------|---------------|
| `MaZiqc` | List conversations | Only if app/gem conversation POST |
| `hNvQHb` | Fetch message content | Read-only, no sync |
| `MUAZcd` | Edit title | ✅ Modifying |
| `GzXR5e` | Delete conversation | ✅ Modifying |
| `PCck7e` | Summarize/stream | ✅ (with 1s delay) |
| `qWymEb` | Unknown modify | ✅ Modifying |
| `CNgdBe` | List Gems | ✅ Modifying |
| `HcT8bb` | Unknown modify | ✅ Modifying |
| `o30O0e` | Profile/account info | No sync (triggers account setup) |
| Stream requests | `StreamGenerate`, `assistant.lamda` | ✅ (with 1s delay) |
| App conversations | POST to `/app/*` or body has `c_*` | ✅ If POST with auth token |

### 4.3 Profile Sync via Network (`o30O0e` handler)
When an `o30O0e` request is intercepted, the interceptor:
1. Extracts profile info (ID, name, email) from the response body.
2. Handles account migration (ID changed → migrate org/account).
3. Creates/updates account with the extracted profile data.
4. Updates the current service state in `idb.services`.
5. Creates org records if none exist.

### 4.4 Account Profile Extraction (`extractProfileInfo`)
- **What**: Parse the response body of an `o30O0e` RPC call to extract user ID, name, and email.
- **Data path**: `responseBody[0][0][2]` → `{ id: [0], name: [2][0][1], email: [9][0][1] }`.

### 4.5 Sync Throttling
- **Per-org throttle**: Maximum one sync trigger per org every **5 seconds** (`syncThrottleCache`).
- **PCck7e/stream special handling**: These requests get a **1-second delay** before the sync trigger fires (the API needs time to commit the change).
- **PCck7e exclusion**: PCck7e requests do NOT update the throttle cache — prevents summary actions from blocking subsequent syncs.

### 4.6 Manual Sync Mode
- **Setting**: `LiveStorage` path: `settings.general.manualSync`.
- **Behavior**: When enabled, the network interceptor **skips all auto-sync triggers**. The user must manually click "Sync."
- **Default**: Auto-sync (manual mode off).

---

## 5. Rate Limiting & Error Recovery

### 5.1 Rate Limiter
- **Window**: 10 seconds.
- **Max requests**: 5 per window.
- **Min gap**: 1 second between consecutive requests.
- **Auto-reset**: After 5 minutes (when triggered by a sorry page).
- **Detection**: Google responds with a "sorry" (CAPTCHA) page when rate-limited. The `parseResponse` function detects this via URL patterns (`/sorry/`) and content heuristics (short HTML, missing RPC IDs).

### 5.2 Rate Limit Handling (Sorry Page)
When detected:
1. **Marks service as rate-limited** in `idb.services` (`isRateLimited: true`).
2. **Emits event** via `emitRateLimitEvent(SERVICE_ID, true)`.
3. **Shows notification** (throttled to once per 5 minutes).
4. **Auto-resets after 5 minutes**: Clears rate limit flag, resets rate limiter, clears profile cache, emits `rateLimited: false`.

### 5.3 Empty Response Detection
- Pattern: `"${rpcids}",null,null,null,` followed by `,"generic"`.
- Throws `EmptyResponseError` — the caller handles this gracefully (e.g., `fetchContent` returns `null` for empty responses).

### 5.4 Batchexecute Response Parsing (`parseResponse` + `getData`)
- **Format**: Google's batchexecute wraps JSON in JSON (double-parsed).
- **Error tolerance**: If the response can't be parsed, logs a warning and returns `null` rather than crashing.
- **Safety checks**: Validates slice indices before parsing, detects unexpected object structures.

---

## 6. Configuration & Settings (via LiveStorage)

| Setting Path | Type | Default | Purpose |
|---|---|---|---|
| `settings.general.manualSync` | boolean | `false` | When `true`, disables auto-sync on network activity |
| `settings.summary.orgId` | string | unset | Active organization ID used for summarization prompts |

---

## 7. Internal Utilities

### 7.1 Page HTML Parsing (`parseProfilePage` + `extractQuotedValue`)
- **Token extraction**: Regex `"SNlM0e":"<value>"` for the auth token.
- **Fallback**: If JSON extraction fails, uses a general `[a-zA-Z0-9_-]{26,30}:[0-9]{13,}` pattern.
- **User info**: Name/email extracted via HTML pattern `: <name> &#10;(<email>)"`.

### 7.2 Conversation Data Parsing (`dataToHeader`)
- **Input**: Raw array `[id, title, ..., timestamp, ..., gemId]`.
- **Output**: `{ id (stripped of c_ prefix), title, updated (ms timestamp), gemId? }`.
- **Validation**: Rejects missing required fields (id, title, timestamp) and malformed IDs.

### 7.3 Message Pair Parsing (`msgToIdb`)
- **Input**: Raw array `[idPair, parentInfo, content, response, timestamp]`.
- **Output**: Two `Message` objects — a user message and its assistant response — linked by `parent` ID.
- **Timestamp offset**: User message timestamp is set 3ms before the response timestamp (ordering guarantee).
- **ID extraction**: Strips the underscore-prefixed internal IDs (`abc_123` → `123`).

### 7.4 Stream Response Parsing (`parseStreamResponse`)
- **What**: Parse the response from `StreamGenerate` endpoint.
- **Format normalization**: Strips leading junk characters before `[["wrb.fr"`.
- **Conversation ID extraction**: From `inner[1][0]` split on `_`.
- **Response text extraction**: Tries primary path (`inner[4][0][1][0]`), falls back to alternative path (`inner[4][0][0]`).
- **Skips empty/short responses**: Ignores blocks under 10 characters.

### 7.5 Search Result Parsing (`parseSearchResults`)
- **Input**: batchexecute result for `unqWSc` RPC.
- **Array structure**: `data[0]` contains rows, each `row[0][0]` has `c_<id>`, `row[0][1]` has title, `row[2]` has deeply nested timestamp.
- **Timestamp resolution**: Handles both millisecond and second-precision timestamps (checks `> 1e12`).

### 7.6 Chat URL Builder (`getChatUrl`)
- **What**: Build the `https://gemini.google.com/app/{id}` or Gem URL.
- **GSI support**: Prepends `/u/{index}` for multi-account users.
- **Gem URLs**: Uses `/gem/{gemId}/{conversationId}` format when the conversation is from a Gem.
- **Validation**: Errors on missing conversation ID, header, or accountId.

### 7.7 Base Request Config (`BASE_REQUEST`)
- **Content-Type**: `application/x-www-form-urlencoded;charset=UTF-8`.
- **Credentials**: `include` (sends cookies).
- **Service ID**: `gemini` (used by the parent extension's `fetchServiceApi` routing).

---

## 8. RPC ID Reference (all known Gemini batchexecute RPC IDs)

| RPC ID | Function | Used In |
|--------|----------|---------|
| `MaZiqc` | List/paginate conversations | `fetchHeaders`, `fetchAllGems`, `onFetch` |
| `hNvQHb` | Fetch messages for a conversation | `fetchContent` |
| `MUAZcd` | Edit conversation title | `edit` |
| `GzXR5e` | Delete conversation | `delete`, `fetchSummary` (cleanup) |
| `PCck7e` | Summarize / stream | `onFetch` (sync trigger classification) |
| `qWymEb` | Unknown (modify type) | `onFetch` (sync trigger classification) |
| `CNgdBe` | List Gem definitions | `fetchAllGems` |
| `HcT8bb` | Unknown (modify type) | `onFetch` (sync trigger classification) |
| `unqWSc` | Search conversations | `searchGeminiConversations` |
| `o30O0e` | Profile / account info | `onFetch` (account setup) |

---

## 9. Exported API Surface

```
geminiService  (ServiceDefinition)
  .domain              → 'gemini.google.com'
  .id                  → 'gemini'
  .name                → 'Gemini'
  .untiteled           → ''
  .maxLimit            → 500
  .getChatUrl(id)      → Promise<string>
  .onFetch(details, cb) → Promise<void>
  .onGoogleAccountFetch(email) → Promise<void>
  .isOffline(accountId) → Promise<boolean>
  .edit(conv, title)   → Promise<any>
  .delete(conv)        → Promise<any>
  .ping(org)           → Promise<any>

Standalone exports:
  fetchAllGems(org)          → Promise<Conversation[]>
  fetchHeaders(org, offset, limit, cursor) → Promise<PaginatedResult>
  fetchContent(conversation) → Promise<Conversation | null>
  createConversation(orgId, prompt, signal?) → Promise<any>
  fetchSummary(orgId, prompt, systemPrompt?, signal?) → Promise<string>
  searchGeminiConversations(query, account) → Promise<any[]>
  syncMissingFromSearch(results, org, progressCallback?) → Promise<any[]>
  EmptyResponseError          → Error class
```

---

## 10. Error Handling Patterns

| Scenario | Behavior |
|----------|----------|
| Rate limited (sorry page) | Throws Error with `status: 429`, auto-resets after 5 min |
| Empty RPC response | Throws `EmptyResponseError`, callers handle gracefully |
| Missing auth token | Fetches fresh token from profile page, retries once |
| 400 on `fetchHeaders` | Refreshes token, retries once. If 400 persists, returns empty results |
| Network error on create | Detects `networkError` / `offline` flags, throws descriptive error |
| Parse failure | Logs error with context, returns `null` (never crashes) |
| Invalid token/index | Throws descriptive Error with details |
| Missing data fields | Logs warning, returns `null` for that item (continues processing) |
| Max pagination reached (50 pages) | Stops paginating, returns what was fetched so far |

---

## 11. Caching Strategy

| Cache | Location | TTL | Purpose |
|---|---|---|---|
| Auth token (`SNlM0e`) | `profileCache` (in-memory Map) | 3 min | Avoid re-fetching profile page on every RPC call |
| Sync throttle | `syncThrottleCache` (in-memory Map) | 5s per org | Prevent redundant sync triggers from rapid network activity |
| Rate limit notification | `rateLimitNotificationCache` (in-memory Map) | 5 min per service | Throttle "you're rate limited" popups |
| Fetch limit | `fetchLimitCache` (module variable) | Session | Adaptive batch size for conversation listing |
| Gem conversation cache | `chrome.storage.local` | On each `MaZiqc` response | Quick access to Gem-type conversations |
