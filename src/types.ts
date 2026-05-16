// ============================================================================
// types.ts — Shared type definitions for all providers
// ============================================================================

// ---- Provider Capabilities ----

export type ProviderCapabilityType =
  | 'conversation-list'
  | 'message-fetch'
  | 'search'
  | 'auto-sync'
  | 'edit-title'
  | 'delete-conversation'
  | 'create-conversation'
  | 'stream'
  | 'summary'

/** Describes what a provider can do */
export interface ProviderCapability {
  type: ProviderCapabilityType
  label: string
  description: string
}

// ---- Provider Configuration ----

export interface ProviderConfig {
  id: string
  name: string
  domain: string
  origins: string[]
  capabilities: ProviderCapability[]
}

// ---- Data Types ----

export interface Account {
  id: string
  serviceId: string
  index: number
  token: string
  email: string
  name?: string
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
