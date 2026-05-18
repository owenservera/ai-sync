// ============================================================================
// types.ts — Shared type definitions for all providers
// ============================================================================

// ---- Provider Configuration ----

export interface ProviderConfig {
  id: string
  name: string
  domain: string
  origins: string[]
}

// ---- Data Types ----

export enum AccountStatus {
  /** Discovered via cookie scan but not yet verified with a network call */
  Discovered = 'discovered',
  /** Authenticated and actively syncing */
  Active = 'active',
  /** Authentication expired or user revoked access */
  Expired = 'expired',
  /** User manually disabled this account */
  Disabled = 'disabled',
}

export interface Account {
  id: string
  serviceId: string
  index: number
  email: string
  name?: string
  status: AccountStatus
  lastVerified: number
  lastSync: number | null
}

export interface Org {
  id: string
  serviceId: string
  accountId: string
  email: string
  name: string
  status: OrgStatus
}

export enum OrgStatus {
  New = 'new',
  Active = 'active',
  Inactive = 'inactive',
}

export interface Header {
  id: string
  orgId: string
  accountId: string
  serviceId: string
  title: string
  created: number
  updated: number
  gemId?: string
  gemName?: string
}

export interface Message {
  id: string
  parent: string | null
  role: 'user' | 'assistant' | 'system'
  content: string | null
  timestamp: number
  metadata?: Record<string, any>
}

export interface Conversation {
  id: string
  orgId: string
  serviceId: string
  title: string
  created: number
  updated: number
  currentMessage?: string
  messages?: Message[]
}

export interface ServiceState {
  id: string
  isRateLimited?: boolean
  current?: {
    accountId: string
    email: string
    token: string
  }
  settings?: Record<string, any>
}

// ---- Pagination ----

export interface PaginatedResult<T> {
  items: T[]
  offset: number
  total: number
  limit: number
  missing: number
  next?: string
}

export interface SearchResult {
  id: string
  title: string
  updated: number
  snippet?: string
}

// ---- Auth ----

export interface AuthProfile {
  at: string | null
  id: string | null
  name?: string
  email?: string
}

// ---- Network / Sync ----

export interface RequestDetails {
  url: string
  request: {
    method: string
    body: string
  }
  response?: {
    body: any
    status: number
  }
}

export interface SyncTrigger {
  providerId: string
  type: 'modify' | 'stream' | 'view' | 'create'
  conversationId?: string
}

// ---- Service Definition (original gemini.ts format) ----

export interface ServiceDefinition {
  domain: string
  id: string
  name: string
  untiteled: string
  maxLimit: number
  getChatUrl(conversationId: string): Promise<string>
  onFetch?(details: RequestDetails, triggerSync: (org: Org) => Promise<void>): Promise<void>
  onGoogleAccountFetch?(email: string): Promise<void>
  isOffline(accountId: string): Promise<boolean>
  edit(conversation: any, title: string): Promise<any>
  delete(conversation: any): Promise<any>
  ping(org: any): Promise<any>
}

// ---- Content types for sidepanel ----

export interface ProviderState {
  id: string
  name: string
  connected: boolean
  conversationCount: number
  lastSync: number | null
  isSyncing: boolean
  isRateLimited: boolean
  error?: string
}
