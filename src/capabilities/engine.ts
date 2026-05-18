// src/capabilities/engine.ts
// ApiEngine — unified execution layer. Validates, resolves account, routes to handler.

import type { CapabilityHandler } from './types'
import { registry } from './registry'
import { getProvider } from '../providers/provider-registry'
import { idb } from '../idb'

export interface ExecuteParams {
  providerId: string
  capabilityId: string
  accountId?: string
  [key: string]: unknown
}

class ApiEngine {
  constructor(private reg: typeof registry) {}

  /** Resolve account with cache-first strategy: IDB → detectAccounts fallback */
  private async resolveAccount(providerId: string, accountId?: string): Promise<any> {
    const provider = getProvider(providerId)
    if (!provider) throw new Error(`Provider not found: ${providerId}`)

    // Step 1: Try cached accounts from IDB (with or without token — token may be populated later by network)
    const cached = await idb.accounts
      .filter((a: any) => a.serviceId === providerId)
      .toArray()
    if (cached.length > 0) {
      // Prefer accounts with tokens, but fall back to any account
      const withToken = cached.find((a: any) => a.token)
      const preferred = withToken || cached[0]
      return accountId
        ? cached.find((a: any) => a.id === accountId) || preferred
        : preferred
    }

    // Step 2: Fallback to provider.detectAccounts() (network call)
    const accounts = await provider.detectAccounts()
    return accountId
      ? accounts.find((a: any) => a.id === accountId)
      : accounts[0]
  }

  async execute(params: ExecuteParams): Promise<unknown> {
    const { providerId, capabilityId, accountId, ...capabilityParams } = params

    // 1. Validate capability exists
    const def = this.reg.get(capabilityId)
    if (!def) throw new Error(`Unknown capability: ${capabilityId}`)

    // 2. Validate provider supports it (skip for utility/meta that don't require provider)
    if (def.category === 'core' || def.category === 'provider') {
      if (!this.reg.hasCapability(providerId, capabilityId)) {
        throw new Error(`Provider ${providerId} does not support capability: ${capabilityId}`)
      }
    }

    // 3. Validate parameters
    const validation = this.reg.validateParams(capabilityId, capabilityParams)
    if (!validation.valid) {
      throw new Error(`Invalid params for ${capabilityId}: ${validation.errors.join(', ')}`)
    }

    // 4. Resolve account if required (cache-first abstraction)
    let account: any
    if (def.requiresAccount) {
      account = await this.resolveAccount(providerId, accountId)
      if (!account) throw new Error('No authenticated account found')
    }

    // 5. Get and execute handler
    const handler = this.reg.getHandler(capabilityId)
    if (!handler) throw new Error(`No handler registered for: ${capabilityId}`)

    return handler({
      providerId,
      accountId,
      account,
      params: capabilityParams,
    })
  }
}

export const engine = new ApiEngine(registry)
