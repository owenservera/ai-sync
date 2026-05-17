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

export interface HandlerContext {
  providerId: string
  accountId?: string
  account?: any
  params: Record<string, unknown>
}

export type CapabilityHandler = (ctx: HandlerContext) => Promise<unknown>
