# Universal Dynamic Index (UDI)
## Architecture, Vision & Applied Design

**Version:** 1.0  
**Status:** Draft  
**Classification:** Core Infrastructure — Foundational Architecture

---

## 1. Vision

Most systems treat data integration as a plumbing problem — write fetch logic, write storage logic, connect them with glue code, repeat per provider, per use case, forever.

The Universal Dynamic Index treats integration as a **declaration problem**.

You declare what exists. You declare how to interact with it. The system derives everything else — execution, storage schema, sync behavior, reconciliation, auth, retry, pagination — from those declarations.

The **Index** is not a cache. It is not a database table. It is a **living function registry** — a queryable, versioned, runtime-aware catalog of what the system knows about the world, what it knows how to do, and what state everything is in.

The **Header** is not a config file. It is a **method descriptor** — a complete, self-contained specification of one operation: what it needs, what it does, what it produces, and what it means for the DB.

Together, the Index and Headers **define the database map**. The schema is not designed separately and then populated — it is a projection of declared operations. The DB is what the system produces when it executes Headers against the Index.

This document specifies the architecture of that system, with the AI conversation sync engine as the applied reference implementation. But the design is intentionally broader. Any system that touches external data — APIs, filesystems, streams, services, local state — can be described, executed, and maintained through this pattern.

---

## 2. Problem Statement

### 2.1 The Integration Accumulation Problem

Every integration with an external provider produces the same class of technical debt:

- Auth token logic duplicated across every operation function
- Pagination state stored in global mutable variables, not with the resource it belongs to
- Retry logic copy-pasted with minor variation per provider
- Operation identifiers (RPC IDs, endpoint slugs, method names) scattered as magic strings
- Rate limiting spread across multiple ad-hoc caches with no unified policy
- Reconciliation (diff what we have vs. what arrived) written per-provider instead of once
- The database schema designed separately from the operations that populate it — they drift apart over time
- Dual API surfaces that persist indefinitely when refactoring (legacy + internal versions)
- No single place that answers: what does this operation do, what does it expect, what does it produce?

### 2.2 The Scaling Problem

When one provider has these problems, it is manageable. When five providers share them, it is a maintenance burden. When the system needs to support arbitrary providers — including ones not yet known — the entire architecture collapses. Every new provider forces the same decisions from scratch.

### 2.3 The Schema Drift Problem

In conventional systems, the database schema is an artifact designed by engineers, then populated by code. As providers change, as operations are added, the schema and the code diverge. Migrations are written to compensate. This is structural — the schema and the operations that define it are not co-located, so they cannot stay synchronized.

### 2.4 The Observability Problem

Because operations are code rather than data, you cannot query them. You cannot ask: "what operations are registered?", "what is the current state of this resource?", "what will happen when this operation runs?", "what changed in the last sync?". The system cannot describe itself.

---

## 3. Design Principles

### P1 — The Index Is the Function

The index entry for any resource is the function signature for all valid operations against that resource. It is not a pointer to data. It is not a cache entry. It encodes: what the resource is, what state it is in, what operations are permitted, what the current pagination contract is, what auth context applies, and when it was last touched. Querying the index is querying the function registry.

### P2 — The Header Is the Method

A Header is the complete definition of one operation. Every field required to execute the operation — transport, auth strategy, request construction, response parsing, normalization target, retry policy, rate limit policy, pagination contract, downstream triggers — is declared in the Header. No runtime decisions are made outside a Header. No logic lives in executor code that is not derivable from a Header field.

### P3 — The DB Is a Projection

The database schema is not designed. It is derived. Every table, every field, every index is the materialized output of the `normalize` function declared in one or more Headers. If no Header produces a field, the field does not exist. If a Header changes its normalization target, the DB updates. Schema and operations are co-located by definition and cannot drift.

### P4 — Operations Are Data, Not Code

An operation is a static record, not a function. It can be serialized, stored, queued, replayed, inspected, versioned, diffed, and audited. The executor is generic. The operation tells the executor what to do. Provider-specific logic lives in registered pure functions (parse, normalize, build_args) referenced by name from the Header — not embedded in the executor.

### P5 — State Lives at the Resource Level

Pagination cursors, rate limit state, sync throttle timers, fetch limits, retry counts — none of these live in global variables. They live in the index entry for the specific resource they apply to. Global mutable state is a symptom of mislocated state. The index entry is the correct location for all per-resource runtime state.

### P6 — The System Is Queryable at Every Layer

At any point in time, you can ask:
- What resources are registered? (Index query)
- What operations are available against a resource? (Header registry query)
- What is the current state of a resource? (Index entry read)
- What happened in the last N operations? (Operation log query)
- What will the DB look like after this operation runs? (Header dry-run)

The system can describe itself completely from its own data.

### P7 — Provider-Specific Logic Is Isolated and Replaceable

Provider logic — the shape of an API response, the format of an auth token, the structure of a cursor — lives in registered pure functions. These functions are the only things that change between providers. Everything else — execution, auth refresh, retry, reconciliation, DB write — is universal and never touches provider-specific code.

### P8 — Future Providers Cost Only Headers

Adding a new provider requires writing Header definitions and their associated pure functions. No executor code changes. No DB migration required if the normalization targets already exist. No new infrastructure. Providers are additive, not multiplicative.

---

## 4. Core Architecture

### 4.1 The Three Primitives

```
┌─────────────────────────────────────────────────────────────────┐
│                         INDEX                                   │
│   Living function registry. Queryable. Versioned. Stateful.    │
│   The index entry IS the function signature.                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ drives
┌──────────────────────────▼──────────────────────────────────────┐
│                        HEADERS                                  │
│   Method descriptors. Self-contained. Composable. Declarative. │
│   One Header = one complete operation specification.           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ produces
┌──────────────────────────▼──────────────────────────────────────┐
│                        DB MAP                                   │
│   The materialized projection of declared operations.          │
│   Schema = union of all Header normalize() output shapes.      │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.2 INDEX — The Function Registry

The index is a first-class, queryable data structure. Every resource the system knows about has exactly one index entry. The index entry is the authoritative source of truth for the resource's identity, state, and operational context.

#### IndexEntry Schema

```typescript
interface IndexEntry {

  // ── Identity ────────────────────────────────────────────────
  key: string
  // Canonical, globally unique. Composite:
  // `${provider}:${resource_type}:${scope}:${resource_id}`
  // e.g. "gemini:conversation:acct_abc:c_8f3a91"
  // e.g. "github:pull_request:repo_myorg/myrepo:pr_442"
  // e.g. "fs:file:workspace_1:/docs/spec.md"
  // e.g. "slack:message_page:channel_C012:cursor_xoxb"

  provider: string                  // registered provider id
  resource_type: string             // registered resource type
  scope: string                     // account / org / workspace / partition
  resource_id: string               // provider-native id, normalized (no 'c_' prefix etc)
  version: number                   // monotonically increasing, incremented on every write
  checksum: string                  // hash of last known normalized content

  // ── Function Declarations ────────────────────────────────────
  // Which Headers are valid to invoke against this resource.
  // This is what makes the index entry a function — it declares
  // what operations are permitted, not just what exists.
  permitted_operations: string[]    // Header ids: ['gemini:list_conversations', 'gemini:fetch_messages']
  active_operation: string | null   // Header id of currently executing operation
  operation_queue: string[]         // Ordered Header ids pending execution

  // ── State Machine ────────────────────────────────────────────
  // The index entry is a state machine, not a simple status flag.
  lifecycle: LifecycleState
  // 'discovered'     — known to exist, not yet fetched
  // 'fetching'       — operation in flight
  // 'fresh'          — data is current within TTL
  // 'stale'          — TTL expired, needs sync
  // 'pending_write'  — local change not yet committed upstream
  // 'conflict'       — local and remote have diverged
  // 'error'          — last operation failed
  // 'tombstone'      — deleted, retained for reconciliation

  error: OperationError | null      // last error if lifecycle === 'error'
  retry_count: number
  last_successful_operation: string | null  // Header id

  // ── Pagination Contract ──────────────────────────────────────
  // Pagination state belongs to the resource, not a global variable.
  pagination: {
    type: 'cursor' | 'offset' | 'page' | 'keyset' | 'none'
    cursor: string | null           // current position
    offset: number
    page: number
    limit: number                   // last known page size (adaptive, not global)
    total_known: number             // may be estimate
    has_more: boolean
    exhausted: boolean              // no more pages exist
  }

  // ── Auth Context ─────────────────────────────────────────────
  // Auth context is per-resource. Not global. Not per-provider.
  // A resource may require specific account, scope, or token type.
  auth: {
    account_id: string
    account_index: number           // for multi-account providers (Gemini /u/N)
    token_hash: string              // hash only — never store raw token in index
    token_expires_at: number
    scopes: string[]                // OAuth scopes or equivalent
    last_refreshed: number
  }

  // ── Rate Limit & Throttle ─────────────────────────────────────
  // Rate limit state per resource. Not shared global caches.
  rate_limit: {
    requests_in_window: number
    window_start: number
    last_request: number
    is_limited: boolean
    limited_until: number
    throttle_until: number          // for sync throttle (e.g. 5s between syncs)
  }

  // ── Timestamps ───────────────────────────────────────────────
  discovered_at: number
  created_at: number                // resource creation time (from provider)
  updated_at: number                // resource update time (from provider)
  synced_at: number                 // last successful sync
  expires_at: number                // when this entry is considered stale
  ttl_ms: number                    // configured TTL for this resource type

  // ── Lineage ──────────────────────────────────────────────────
  // How this entry was discovered. Critical for reconciliation.
  discovered_via: string            // Header id that produced this entry
  parent_key: string | null         // parent resource key (e.g. conversation → account)
  children_keys: string[]           // child resource keys
  
  // ── Metadata ─────────────────────────────────────────────────
  tags: string[]                    // arbitrary queryable labels
  annotations: Record<string, unknown>   // extensible, non-structural metadata
}
```

#### Index as Query Surface

The index must support structured queries across all fields. These are the access patterns the system is built around:

```
// What needs syncing right now?
index.query({ lifecycle: 'stale', provider: 'gemini', resource_type: 'conversation' })

// What is currently in flight?
index.query({ lifecycle: 'fetching', scope: account_id })

// What operations are queued?
index.query({ operation_queue: { $not_empty: true } })

// What resources were discovered via a specific Header?
index.query({ discovered_via: 'gemini:list_conversations' })

// What failed and should be retried?
index.query({ lifecycle: 'error', retry_count: { $lt: 3 } })

// What has changed since a given version?
index.query({ version: { $gt: last_known_version }, scope: org_id })

// What is rate-limited?
index.query({ 'rate_limit.is_limited': true, 'rate_limit.limited_until': { $lt: now } })
```

---

### 4.3 HEADER — The Method Descriptor

A Header is the complete specification of one operation. There are no partial Headers. There are no runtime decisions made outside a Header. The Header is the contract between the caller, the executor, the parser, and the DB.

Every Header has a stable, unique id. The Header registry is itself queryable.

#### OperationHeader Schema

```typescript
interface OperationHeader {

  // ── Identity ────────────────────────────────────────────────
  id: string
  // Namespaced, stable, human-readable.
  // `${provider}:${resource_type}:${action}`
  // e.g. "gemini:conversation:list"
  // e.g. "gemini:conversation:fetch_messages"
  // e.g. "github:pull_request:list"
  // e.g. "slack:message:stream"
  // e.g. "fs:file:read"

  provider: string
  resource_type: string
  action: Action
  // 'list'       — paginated collection fetch
  // 'get'        — single resource fetch
  // 'search'     — query-based fetch
  // 'create'     — new resource creation
  // 'update'     — mutation of existing resource
  // 'delete'     — removal
  // 'stream'     — long-lived connection
  // 'sync'       — composite: list + fetch missing + reconcile
  // 'summarize'  — derived content generation

  version: string                   // semver. Breaking changes bump major.
  description: string
  use_cases: string[]               // e.g. ['sync_recent', 'full_sync', 'background_refresh']
  tags: string[]

  // ── Capability Declaration ────────────────────────────────────
  // Which capability this Header satisfies.
  // A provider declares capabilities in its ProviderConfig.
  // Headers are the implementations of those capabilities.
  capability: string               // 'conversation-list' | 'message-fetch' | 'search' | ...

  // ── Transport ─────────────────────────────────────────────────
  transport: Transport
  // 'rest'              — standard HTTP REST
  // 'batchexecute'      — Google batchexecute RPC format
  // 'graphql'           — GraphQL query/mutation
  // 'websocket'         — WebSocket connection
  // 'grpc'              — gRPC
  // 'ipc'               — local inter-process (filesystem, native APIs)
  // 'stream_sse'        — Server-Sent Events
  // 'custom'            — registered custom transport

  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'SUBSCRIBE'
  
  rpc_id?: string
  // For batchexecute and similar RPC transports.
  // Named here, never as a magic string at call site.
  // e.g. 'MaZiqc' for Gemini conversation list

  // ── URL / Endpoint ───────────────────────────────────────────
  endpoint: {
    template: string
    // URI template with variable slots.
    // e.g. "https://gemini.google.com{/u/:account_index}/_/BardChatUi/data/batchexecute"
    // e.g. "https://api.github.com/repos/{owner}/{repo}/pulls"
    // e.g. "wss://wss-primary.slack.com/link?{channel}"
    
    resolve: (ctx: OperationContext) => string
    // Pure function. Registered by name. Takes context, returns resolved URL.
    // Registered as: 'gemini:resolve_batchexecute_url'
    
    query_params?: (ctx: OperationContext) => Record<string, string>
    // e.g. { rpcids: 'MaZiqc', 'source-path': '/app' }
  }

  // ── Request Construction ─────────────────────────────────────
  request: {
    format: 'urlencoded' | 'json' | 'multipart' | 'binary' | 'graphql' | 'custom'
    
    headers?: Record<string, string>
    // Static headers. Dynamic headers go in build_fn.
    
    build_fn: string
    // Name of registered pure function.
    // Signature: (ctx: OperationContext, index_entry: IndexEntry) => RequestBody
    // The function constructs the full request body from context + index state.
    // e.g. 'gemini:build_batchexecute_body'
    // This function has access to: cursor, limit, auth token, operation args, etc.
    // It never constructs state itself — it reads it from ctx and index_entry.
    
    args_schema: JSONSchema
    // JSON Schema for the arguments this Header accepts at call time.
    // Validated before execution.
  }

  // ── Authentication ────────────────────────────────────────────
  auth: {
    strategy: AuthStrategy
    // 'bearer_token'    — Authorization: Bearer {token}
    // 'cookie'          — browser cookie (Gemini, Claude webapp)
    // 'api_key'         — X-Api-Key or query param
    // 'oauth2'          — OAuth2 flow with refresh
    // 'basic'           — Basic auth
    // 'request_body'    — token embedded in POST body (Gemini 'at' param)
    // 'none'            — unauthenticated

    token_field?: string
    // Where in the request the token goes.
    // e.g. 'body.at' for Gemini, 'header.Authorization' for REST APIs

    refresh_strategy: RefreshStrategy
    // 'fetch_profile'   — re-fetch auth page and extract token (Gemini pattern)
    // 'oauth_refresh'   — use refresh token to get new access token
    // 'reauth'          — full re-authentication required
    // 'none'            — token does not expire

    refresh_fn: string
    // Name of registered pure function.
    // Signature: (account: Account) => Promise<AuthToken>
    // e.g. 'gemini:fetch_profile_token'

    retry_on_expire: boolean
    // If true, executor auto-refreshes token and retries on auth failure.
  }

  // ── Response Handling ─────────────────────────────────────────
  response: {
    format: ResponseFormat
    // 'json'             — standard JSON
    // 'batchexecute'     — Google batchexecute wrapped JSON
    // 'ndjson'           — newline-delimited JSON
    // 'stream_chunks'    — streaming response
    // 'html_extract'     — HTML page with embedded data (Gemini token extraction)
    // 'binary'           — binary blob
    // 'custom'           — registered custom format

    parse_fn: string
    // Name of registered pure function.
    // Signature: (raw: RawResponse, ctx: OperationContext) => ParsedResult
    // Pure. No side effects. No DB access.
    // e.g. 'gemini:parse_batchexecute_conversation_list'
    // e.g. 'gemini:parse_profile_page_html'
    // e.g. 'github:parse_pull_request_list'

    error_detect_fn?: string
    // Name of registered function that identifies error conditions in
    // what would otherwise be a 200 response.
    // e.g. 'gemini:detect_sorry_page' — detects Google CAPTCHA/rate-limit pages
    // that return HTTP 200 but are not valid API responses

    empty_detect_fn?: string
    // e.g. 'gemini:detect_empty_batchexecute_response'
  }

  // ── Normalization → DB Map ────────────────────────────────────
  // This section defines the DB map.
  // The output shape of normalize_fn is the DB schema for this resource type.
  // All Headers that share a resource_type share a normalize output contract.
  
  normalization: {
    target_schema: string
    // The DB schema this operation populates.
    // e.g. 'Conversation' | 'Message' | 'PullRequest' | 'File' | 'SlackMessage'
    // The schema is the union of all normalize_fn output shapes across all
    // Headers that declare this target_schema.

    normalize_fn: string
    // Name of registered pure function.
    // Signature: (parsed: ParsedResult, ctx: OperationContext) => NormalizedRecord[]
    // Pure. Deterministic. No side effects.
    // e.g. 'gemini:normalize_conversation_header'
    // e.g. 'gemini:normalize_message'

    produces_index_entries: boolean
    // If true, each NormalizedRecord also produces a child IndexEntry.
    // This is how the index grows: a 'list' operation discovers resources,
    // and each discovered resource gets its own index entry with its own
    // permitted_operations, enabling further operations.
    
    index_entry_template?: Partial<IndexEntry>
    // Template for child index entries produced by this operation.
    // Merged with data extracted from the NormalizedRecord.
    // e.g. a conversation list operation produces index entries for each
    // conversation with permitted_operations: ['gemini:conversation:fetch_messages']
  }

  // ── Pagination ────────────────────────────────────────────────
  pagination: {
    type: 'cursor' | 'offset' | 'page' | 'keyset' | 'none'
    
    next_cursor_fn: string
    // Name of registered pure function.
    // Signature: (parsed: ParsedResult) => string | null
    // Extracts the next page cursor from parsed response.
    // Returns null when exhausted.

    has_more_fn: string
    // Signature: (parsed: ParsedResult, index_entry: IndexEntry) => boolean

    items_fn: string
    // Signature: (parsed: ParsedResult) => unknown[]
    // Extracts the array of items from parsed response.

    default_limit: number
    max_limit: number
    adaptive_limit: boolean
    // If true, limit is updated in the index entry based on what the API returns.
  }

  // ── Retry Policy ──────────────────────────────────────────────
  retry: {
    enabled: boolean
    max_attempts: number
    
    triggers: RetryTrigger[]
    // Each trigger specifies the condition and strategy.
    // e.g.:
    // { on_status: [400], strategy: 'refresh_token', then_retry: true }
    // { on_status: [429], strategy: 'backoff', backoff_ms: 60000 }
    // { on_status: [503], strategy: 'backoff', backoff_ms: 5000, jitter: true }
    // { on_error_type: 'EmptyResponseError', strategy: 'abort' }
    // { on_error_type: 'AuthExpiredError', strategy: 'refresh_token', then_retry: true }
    
    backoff_base_ms: number
    backoff_multiplier: number
    backoff_max_ms: number
    jitter: boolean
  }

  // ── Rate Limiting ─────────────────────────────────────────────
  rate_limit: {
    window_ms: number
    max_requests: number
    min_interval_ms: number
    
    scope: 'resource' | 'account' | 'provider' | 'global'
    // Rate limit scope determines which IndexEntry.rate_limit is read/written.
    // 'resource' — per resource (most granular)
    // 'account'  — shared across all resources for an account
    // 'provider' — shared across all accounts for a provider
    // 'global'   — system-wide
    
    on_limit: 'queue' | 'abort' | 'backoff'
    queue_max_depth?: number
  }

  // ── Sync Behavior ─────────────────────────────────────────────
  sync: {
    trigger_types: SyncTriggerType[]
    // What events can trigger this operation.
    // 'network_activity'   — upstream network request detected
    // 'schedule'           — time-based (cron-like)
    // 'manual'             — explicit user or system invocation
    // 'mutation_detected'  — change detected in upstream resource
    // 'index_stale'        — index entry TTL expired
    // 'child_discovered'   — parent operation produced new child index entries
    // 'upstream_push'      — webhook or push notification received

    throttle_ms: number
    // Minimum interval between invocations for the same resource.
    // Enforced via IndexEntry.rate_limit.throttle_until

    produces_trigger?: DownstreamTrigger
    // What this operation causes downstream.
    // e.g. a 'stream' operation completing might trigger 'gemini:conversation:fetch_messages'
    // e.g. a 'list' operation discovering new items triggers 'gemini:conversation:get' for each
    
    side_effects: SideEffect[]
    // Declared side effects. Must be explicit. No hidden effects.
    // e.g. { type: 'delete_resource', target: 'gemini:conversation', condition: 'summarize_cleanup' }
    // e.g. { type: 'emit_event', event: 'conversation.synced' }
    // e.g. { type: 'update_index', target: 'parent_key' }
  }

  // ── Lifecycle Hooks ───────────────────────────────────────────
  hooks: {
    before_execute?: string       // fn name: (ctx) => ctx | throw
    after_parse?: string          // fn name: (parsed, ctx) => parsed | throw
    after_normalize?: string      // fn name: (records, ctx) => records | throw
    after_reconcile?: string      // fn name: (diff, ctx) => void
    on_error?: string             // fn name: (error, ctx) => ErrorAction
  }

  // ── Observability ─────────────────────────────────────────────
  observability: {
    log_level: 'debug' | 'info' | 'warn' | 'error'
    trace: boolean                // emit trace spans
    metrics: string[]             // metric names to emit
    // e.g. ['operation.duration', 'records.normalized', 'records.reconciled']
  }
}
```

---

### 4.4 DB MAP — The Projected Schema

The DB map is not designed. It is declared as a consequence of Header normalization contracts.

#### How the DB Map Is Derived

Every Header declares a `target_schema` and a `normalize_fn`. The DB schema for any resource type is the **union of all `normalize_fn` output shapes** across all Headers that target that schema.

```
DB_SCHEMA['Conversation'] = union(
  gemini:conversation:list       → normalize_fn output shape,
  gemini:conversation:get        → normalize_fn output shape,
  github:pull_request:list       → normalize_fn output shape,
  slack:message:stream           → normalize_fn output shape,
  ...
)
```

This means:

1. Adding a new Header that targets an existing schema automatically extends that schema with its output shape. No migration needed if the new fields are additive.
2. Changing a normalize_fn output shape changes the DB schema for that resource type. The system detects this via version comparison and generates a migration automatically.
3. The DB schema can be fully generated from the Header registry. The schema document is a build artifact, not a source of truth.

#### Universal Normalized Schema (Base)

All target schemas extend this base. Provider-specific fields are additive.

```typescript
interface NormalizedRecord {
  // Universal identity
  _id: string                     // index entry key
  _provider: string
  _resource_type: string
  _scope: string
  _version: number
  _checksum: string
  
  // Universal timestamps
  _discovered_at: number
  _synced_at: number
  _created_at: number
  _updated_at: number

  // Universal lineage
  _parent_id: string | null
  _discovered_via: string         // Header id

  // Provider-specific fields — additive, declared by normalize_fn
  [key: string]: unknown
}
```

#### Example: Conversation Schema (derived from Gemini Headers)

```typescript
// Produced by normalize_fn 'gemini:normalize_conversation_header'
// targeted by Headers: gemini:conversation:list, gemini:conversation:get

interface ConversationRecord extends NormalizedRecord {
  // From gemini:conversation:list
  id: string
  title: string
  updated: number

  // From gemini:conversation:get (additive)
  messages: MessageRecord[]
  current_message_id: string
  created: number

  // From gemini:conversation:list (Gem variant)
  gem_id?: string
  gem_name?: string

  // Universal
  account_id: string
  org_id: string
}
```

---

## 5. Execution Pipeline

The execution pipeline is universal. It does not change per provider or per operation. The Header tells the pipeline what to do at every step.

```
resolve(provider, capability, scope, args)
  │
  ▼
[index lookup]
  Fetch IndexEntry for this resource.
  If none exists: create a 'discovered' entry.
  Check lifecycle, throttle, rate limit.
  Identify correct Header from permitted_operations + capability.
  │
  ▼
[pre-flight]
  Validate args against Header.request.args_schema.
  Check rate_limit state in IndexEntry.
  If throttled: queue or abort per Header.rate_limit.on_limit.
  Run Header.hooks.before_execute if declared.
  Set IndexEntry.lifecycle = 'fetching', IndexEntry.active_operation = header.id.
  │
  ▼
[auth]
  Read token from IndexEntry.auth.
  If expired or missing: invoke Header.auth.refresh_fn.
  Inject token per Header.auth.token_field.
  │
  ▼
[build request]
  Invoke Header.request.build_fn(ctx, index_entry) → RequestBody.
  Resolve endpoint: Header.endpoint.resolve(ctx).
  Build query params: Header.endpoint.query_params(ctx).
  │
  ▼
[execute]
  Send request via Header.transport.
  On response: invoke Header.response.error_detect_fn if declared.
  On response: invoke Header.response.empty_detect_fn if declared.
  On error: evaluate Header.retry.triggers.
    If trigger matches: execute retry strategy (refresh token, backoff, abort).
    Update IndexEntry.retry_count.
  │
  ▼
[parse]
  Invoke Header.response.parse_fn(raw, ctx) → ParsedResult.
  Run Header.hooks.after_parse if declared.
  │
  ▼
[transform]
  Invoke Header.normalization.normalize_fn(parsed, ctx) → NormalizedRecord[].
  If Header.normalization.produces_index_entries:
    For each NormalizedRecord: create/update child IndexEntry.
    Apply Header.normalization.index_entry_template.
  Extract pagination: invoke Header.pagination.next_cursor_fn(parsed).
  Run Header.hooks.after_normalize if declared.
  │
  ▼
[reconcile]
  Compare NormalizedRecord[] against current DB state.
  Compute diff: { added, updated, deleted, unchanged }.
  Apply diff to DB.
  Run Header.hooks.after_reconcile if declared.
  │
  ▼
[commit index]
  Update IndexEntry:
    lifecycle → 'fresh' (or 'stale' if has_more)
    checksum → hash of NormalizedRecord[]
    version → version + 1
    pagination.cursor → next_cursor
    pagination.has_more → has_more
    pagination.exhausted → !has_more && !cursor
    rate_limit.last_request → now
    rate_limit.requests_in_window → increment
    synced_at → now
    expires_at → now + ttl_ms
    active_operation → null
    retry_count → 0 (on success)
  │
  ▼
[dispatch]
  If Header.sync.produces_trigger: dispatch downstream trigger.
  Emit declared side effects: Header.sync.side_effects.
  Emit observability events: Header.observability.metrics.
  │
  ▼
ReconcileResult {
  diff: { added, updated, deleted, unchanged },
  next_cursor: string | null,
  index_entry: IndexEntry,
  trigger: DownstreamTrigger | null
}
```

---

## 6. Provider Registry

A provider is a declaration, not a class hierarchy. It declares its identity, capabilities, auth surface, and the Headers it implements.

```typescript
interface ProviderDefinition {
  id: string                        // 'gemini' | 'github' | 'slack' | 'fs' | ...
  name: string
  version: string
  domains: string[]                 // ['gemini.google.com']
  origins: string[]                 // ['https://gemini.google.com/*']

  capabilities: CapabilityDeclaration[]
  // Each capability maps to one or more Headers.
  // e.g. { type: 'conversation-list', header_ids: ['gemini:conversation:list'] }

  auth_surface: {
    strategies: AuthStrategy[]
    multi_account: boolean
    max_accounts: number            // Gemini: 10
    account_discovery: string       // fn name: () => Account[]
    account_id_strategy: 'email' | 'cookie' | 'token' | 'custom'
  }

  transports: Transport[]           // which transports this provider uses
  
  resource_types: ResourceTypeDeclaration[]
  // Declares what resource types this provider exposes and the
  // index entry templates for each.

  registered_functions: Record<string, Function>
  // All pure functions referenced by name in this provider's Headers.
  // This is the only place provider-specific code lives.
  // Keyed by function name. Validated at registration time.

  default_ttl_ms: Record<string, number>
  // Per resource_type default TTL.
  // e.g. { 'conversation': 300000, 'message': 86400000 }

  headers: OperationHeader[]
  // All Headers this provider implements.
  // Registered into the global Header registry at provider registration.
}
```

---

## 7. Applied Reference: AI Conversation Sync

The conversation sync engine is the first-class application of UDI. Below is how it maps.

### 7.1 Provider Registration: Gemini

```typescript
const GeminiProvider: ProviderDefinition = {
  id: 'gemini',
  name: 'Gemini',
  version: '2.0.0',
  domains: ['gemini.google.com'],
  origins: ['https://gemini.google.com/*'],
  
  capabilities: [
    { type: 'conversation-list',     header_ids: ['gemini:conversation:list'] },
    { type: 'message-fetch',         header_ids: ['gemini:conversation:fetch_messages'] },
    { type: 'search',                header_ids: ['gemini:conversation:search'] },
    { type: 'auto-sync',             header_ids: ['gemini:conversation:list', 'gemini:conversation:fetch_messages'] },
    { type: 'edit-title',            header_ids: ['gemini:conversation:update_title'] },
    { type: 'delete-conversation',   header_ids: ['gemini:conversation:delete'] },
    { type: 'create-conversation',   header_ids: ['gemini:conversation:create'] },
    { type: 'summarize',             header_ids: ['gemini:conversation:summarize'] },
    { type: 'gem-list',              header_ids: ['gemini:gem:list'] },
  ],

  auth_surface: {
    strategies: ['cookie', 'request_body'],
    multi_account: true,
    max_accounts: 10,
    account_discovery: 'gemini:discover_accounts',
    account_id_strategy: 'email',
  },

  registered_functions: {
    'gemini:resolve_batchexecute_url':          resolveBatchexecuteUrl,
    'gemini:build_batchexecute_body':           buildBatchexecuteBody,
    'gemini:parse_batchexecute_conversation_list': parseConversationList,
    'gemini:parse_batchexecute_messages':       parseMessages,
    'gemini:parse_profile_page_html':           parseProfilePage,
    'gemini:parse_stream_generate':             parseStreamGenerate,
    'gemini:normalize_conversation_header':     normalizeConversationHeader,
    'gemini:normalize_message':                 normalizeMessage,
    'gemini:detect_sorry_page':                 detectSorryPage,
    'gemini:detect_empty_batchexecute':         detectEmptyBatchexecute,
    'gemini:fetch_profile_token':               fetchProfileToken,
    'gemini:discover_accounts':                 discoverAccounts,
    'gemini:extract_next_cursor':               extractNextCursor,
    'gemini:extract_conversation_items':        extractConversationItems,
    'gemini:has_more_conversations':            hasMoreConversations,
  },
}
```

### 7.2 Example Header: List Conversations

```typescript
const GeminiListConversations: OperationHeader = {
  id: 'gemini:conversation:list',
  provider: 'gemini',
  resource_type: 'conversation',
  action: 'list',
  version: '2.0.0',
  description: 'Paginated fetch of conversation headers from Gemini batchexecute API',
  use_cases: ['sync_recent', 'full_sync', 'background_refresh'],
  capability: 'conversation-list',
  tags: ['paginated', 'batchexecute', 'auto-sync'],

  transport: 'batchexecute',
  method: 'POST',
  rpc_id: 'MaZiqc',

  endpoint: {
    template: 'https://gemini.google.com{/u/:account_index}/_/BardChatUi/data/batchexecute',
    resolve: 'gemini:resolve_batchexecute_url',
    query_params: () => ({ rpcids: 'MaZiqc', 'source-path': '/app', 'f.sid': '-' }),
  },

  request: {
    format: 'urlencoded',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    build_fn: 'gemini:build_batchexecute_body',
    args_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, default: 100 },
        cursor: { type: ['string', 'null'], default: null },
      },
    },
  },

  auth: {
    strategy: 'request_body',
    token_field: 'body.at',
    refresh_strategy: 'fetch_profile',
    refresh_fn: 'gemini:fetch_profile_token',
    retry_on_expire: true,
  },

  response: {
    format: 'batchexecute',
    parse_fn: 'gemini:parse_batchexecute_conversation_list',
    error_detect_fn: 'gemini:detect_sorry_page',
    empty_detect_fn: 'gemini:detect_empty_batchexecute',
  },

  normalization: {
    target_schema: 'Conversation',
    normalize_fn: 'gemini:normalize_conversation_header',
    produces_index_entries: true,
    index_entry_template: {
      resource_type: 'conversation',
      permitted_operations: ['gemini:conversation:fetch_messages', 'gemini:conversation:update_title', 'gemini:conversation:delete'],
      lifecycle: 'stale',
      ttl_ms: 86400000,
    },
  },

  pagination: {
    type: 'cursor',
    next_cursor_fn: 'gemini:extract_next_cursor',
    has_more_fn: 'gemini:has_more_conversations',
    items_fn: 'gemini:extract_conversation_items',
    default_limit: 100,
    max_limit: 100,
    adaptive_limit: true,
  },

  retry: {
    enabled: true,
    max_attempts: 2,
    triggers: [
      { on_status: [400], strategy: 'refresh_token', then_retry: true },
      { on_status: [429], strategy: 'backoff', backoff_ms: 60000 },
      { on_error_type: 'EmptyResponseError', strategy: 'abort' },
    ],
    backoff_base_ms: 1000,
    backoff_multiplier: 2,
    backoff_max_ms: 60000,
    jitter: true,
  },

  rate_limit: {
    window_ms: 10000,
    max_requests: 5,
    min_interval_ms: 1000,
    scope: 'account',
    on_limit: 'queue',
    queue_max_depth: 10,
  },

  sync: {
    trigger_types: ['network_activity', 'schedule', 'manual', 'index_stale'],
    throttle_ms: 5000,
    produces_trigger: {
      type: 'child_discovered',
      target_header: 'gemini:conversation:fetch_messages',
      condition: 'index_entry.lifecycle === stale',
    },
    side_effects: [
      { type: 'update_index', target: 'parent_key' },
      { type: 'emit_event', event: 'conversation.list.synced' },
    ],
  },

  observability: {
    log_level: 'info',
    trace: true,
    metrics: ['operation.duration', 'conversations.fetched', 'conversations.reconciled'],
  },
}
```

### 7.3 "Sync Most Recent Conversation" — The Full Call

This is the entire call. No provider logic. No auth handling. No pagination logic. No retry logic. All of that is declared in the Header and the IndexEntry.

```typescript
const result = await UDI.execute({
  provider: 'gemini',
  capability: 'conversation-list',
  scope: account_id,
  args: { limit: 1 },
  use_case: 'sync_recent',
})

// result: ReconcileResult {
//   diff: { added: [...], updated: [...], deleted: [...], unchanged: [...] },
//   next_cursor: null,
//   index_entry: IndexEntry { lifecycle: 'fresh', ... },
//   trigger: { type: 'child_discovered', target: 'gemini:conversation:fetch_messages', ... }
// }
```

---

## 8. Future-Proofing & Extensibility

### 8.1 Adding a New Provider

Adding GitHub as a provider requires:

1. Write a `ProviderDefinition` for GitHub
2. Write `OperationHeader` records for each capability (list PRs, get PR, create comment, etc.)
3. Write pure functions for: URL resolution, request building, response parsing, normalization
4. Register them

No executor code changes. No DB migration if normalization targets already exist. No infrastructure changes.

```typescript
// Adding GitHub costs only declarations
const GitHubProvider: ProviderDefinition = {
  id: 'github',
  capabilities: [{ type: 'pull-request-list', header_ids: ['github:pull_request:list'] }],
  registered_functions: {
    'github:parse_pr_list': parsePRList,
    'github:normalize_pr': normalizePR,
    ...
  },
  headers: [GitHubListPRs, GitHubGetPR, GitHubCreateComment],
}

UDI.register(GitHubProvider)
```

### 8.2 Adding a New Capability to an Existing Provider

Add a new Header to the provider's `headers` array and a new entry in `capabilities`. The executor picks it up automatically. The DB schema updates automatically if new fields are added to the normalization output.

### 8.3 Provider Version Migration

Headers are versioned. When a provider API changes, increment the Header version. The system maintains both versions during transition. Index entries carry the Header id and version they were last synced with, enabling gradual migration.

### 8.4 Schema Evolution

Because the DB schema is derived from normalization function outputs, schema changes are detected by comparing normalize_fn output shapes across Header versions. Additive changes (new fields) are automatic. Breaking changes (removed or renamed fields) generate migration descriptors that can be applied or rolled back.

### 8.5 Non-AI Providers

UDI is not an AI conversation system. The conversation sync engine is one application. The same architecture applies to:

```
Filesystem:   fs:file:list, fs:file:read, fs:file:write, fs:directory:watch
GitHub:       github:pull_request:list, github:issue:search, github:commit:stream
Slack:        slack:channel:list, slack:message:stream, slack:thread:fetch
Salesforce:   salesforce:contact:list, salesforce:opportunity:search
Linear:       linear:issue:list, linear:project:get
Email (IMAP): email:thread:list, email:message:fetch
WebSockets:   ws:event:subscribe, ws:event:replay
Local DB:     localdb:record:list, localdb:record:watch
```

Every one of these works through the same pipeline: resolve → execute → transform → reconcile.

### 8.6 Composable Operations

Headers can declare downstream triggers. A `list` operation that discovers new items triggers `get` for each new item. A `stream` operation that receives a mutation triggers a `list` refresh. These chains are declared in Headers, not hardcoded in application logic. Changing the chain means changing a Header declaration.

### 8.7 Observability Without Instrumentation

Because every operation is declared, the system can emit consistent telemetry for every operation without per-provider instrumentation. Metrics, traces, and logs are generated from the Header's `observability` block and the IndexEntry's state transitions. The system is observable by construction.

### 8.8 Operation Replay and Audit

Because operations are data (OperationHeader + IndexEntry + ReconcileResult), every sync event is replayable. The operation log contains everything needed to reproduce a sync run: which Header, which IndexEntry state, which args, which result. This enables debugging, auditing, and testing against historical states without mocking.

---

## 9. What This System Explicitly Avoids

These patterns are prohibited by design:

| Anti-Pattern | Why Prohibited |
|---|---|
| Global mutable state for pagination / rate limits | State belongs to the IndexEntry, not the module |
| Magic string operation identifiers | All operation ids are declared in the Header registry |
| Per-provider executor code | Executor is universal; provider logic lives only in registered functions |
| Duplicate API surfaces (legacy + internal) | One Header per operation; context is in args, not function name |
| DB schema designed separately from operations | Schema is derived from normalization contracts |
| Inline retry logic per function | Retry is declared in Header.retry; executor handles it universally |
| Auth logic in operation functions | Auth is declared in Header.auth; executor handles it universally |
| Reconciliation logic per provider | Reconcile is a universal DB FUNCTION |
| Hidden side effects | All side effects declared in Header.sync.side_effects |
| Undeclared downstream triggers | All triggers declared in Header.sync.produces_trigger |

---

## 10. Glossary

| Term | Definition |
|---|---|
| **UDI** | Universal Dynamic Index — the system described in this document |
| **Index** | The living function registry. One IndexEntry per addressable resource. |
| **IndexEntry** | The function signature for all operations against one resource |
| **Header** | A complete, self-describing operation method descriptor |
| **DB Map** | The database schema derived as a projection of Header normalization contracts |
| **Provider** | A registered external data source with declared capabilities and Headers |
| **Capability** | A named, abstract operation type implemented by one or more Headers |
| **normalize_fn** | A pure function that maps parsed API responses to NormalizedRecord schema |
| **ReconcileResult** | The output of one pipeline execution: diff + new index state + trigger |
| **SyncTrigger** | A downstream operation dispatch produced by a completed Header execution |
| **Lifecycle** | The state machine of an IndexEntry: discovered → fetching → fresh → stale → error |
| **Scope** | The partition an IndexEntry belongs to: account / org / workspace |
| **target_schema** | The DB schema a Header's normalize_fn populates |
| **registered_function** | A pure, named function declared by a provider and referenced by name in its Headers |
