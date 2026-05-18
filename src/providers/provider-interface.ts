import {
  type ProviderConfig,
  type Account,
  type AuthProfile,
  type Header,
  type Conversation,
  type PaginatedResult,
  type SearchResult,
  type RequestDetails,
  type SyncTrigger,
} from '../types'

export interface ConversationProvider {
  /** Unique provider identifier */
  readonly id: string

  /** Human-readable name */
  readonly name: string

  /** Provider configuration/metadata */
  readonly config: ProviderConfig

  // ── Lifecycle ──

  /** Initialize the provider (called once on extension load) */
  init(): Promise<void>

  /** Cleanup on extension shutdown */
  destroy(): Promise<void>

  // ── Authentication ──

  /** Detect authenticated accounts (cookie-based or session) */
  detectAccounts(): Promise<Account[]>

  /** Refresh auth token for a given account index */
  refreshAuth(account: Account): Promise<AuthProfile | null>

  /** Check if a given account is still authenticated */
  isAuthenticated(account: Account): Promise<boolean>

  /** Handle new account detection from browser events */
  onAccountDetected?(email: string, details?: any): Promise<void>

  // ── Data Operations ──

  /** List conversation headers (paginated) */
  listConversations(
    account: Account,
    cursor?: string,
    limit?: number,
  ): Promise<PaginatedResult<Header>>

  /** Fetch full conversation content including messages */
  getConversation(account: Account, conversationId: string): Promise<Conversation | null>

  /** Search conversations by query text */
  search(account: Account, query: string): Promise<SearchResult[]>

  // ── Mutations (capability-gated) ──

  /** Edit conversation title */
  editTitle?(account: Account, conversationId: string, title: string): Promise<void>

  /** Delete a conversation */
  deleteConversation?(account: Account, conversationId: string): Promise<void>

  /** Create a new conversation with initial prompt */
  createConversation?(account: Account, prompt: string, signal?: AbortSignal): Promise<Conversation>

  /** Generate a summary using the provider's model */
  summarize?(account: Account, prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<string>

  // ── Network / Auto-Sync ──

  /** Intercept network requests to detect conversation activity */
  handleNetworkActivity?(details: RequestDetails): Promise<SyncTrigger | null>

  /** Get the chat URL for a specific conversation */
  getChatUrl(conversation: Header): Promise<string>

  // ── Status ──

  /** Check if the provider is reachable for a given account */
  ping(account: Account): Promise<boolean>

  /** Check if this provider has any active capabilities */
  hasCapability(type: string): boolean
}
