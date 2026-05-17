// src/capabilities/engine.ts
// ApiEngine — unified execution layer. Validates, resolves account, routes to handler.

import type { CapabilityHandler } from './types'
import { registry } from './registry'
import { getProvider } from '../providers/provider-registry'

export interface ExecuteParams {
  providerId: string
  capabilityId: string
  accountId?: string
  [key: string]: unknown
}

class ApiEngine {
  constructor(private reg: typeof registry) {}

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

    // 4. Resolve account if required
    let account: any
    if (def.requiresAccount) {
      const provider = getProvider(providerId)
      if (!provider) throw new Error(`Provider not found: ${providerId}`)
      const accounts = await provider.detectAccounts()
      account = accountId
        ? accounts.find((a: any) => a.id === accountId)
        : accounts[0]
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
