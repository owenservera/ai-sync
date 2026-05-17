// src/capabilities/registry.ts
// CapabilityRegistry — single source of truth for capability definitions,
// handler registration, and provider capability declarations.

import type { CapabilityDefinition, CapabilityHandler, CapabilityCategory } from './types'

class CapabilityRegistry {
  private definitions = new Map<string, CapabilityDefinition>()
  private handlers = new Map<string, CapabilityHandler>()
  private providerCapabilities = new Map<string, Set<string>>()

  // ── Registration ──

  register(def: CapabilityDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Duplicate capability registration: ${def.id}`)
    }
    this.definitions.set(def.id, def)
  }

  registerHandler(id: string, handler: CapabilityHandler): void {
    if (!this.definitions.has(id)) {
      throw new Error(`Cannot register handler for unregistered capability: ${id}`)
    }
    if (this.handlers.has(id)) {
      throw new Error(`Duplicate handler registration: ${id}`)
    }
    this.handlers.set(id, handler)
  }

  declareProviderCapability(providerId: string, capabilityId: string): void {
    if (!this.definitions.has(capabilityId)) {
      throw new Error(`Cannot declare capability for unregistered capability: ${capabilityId}`)
    }
    if (!this.providerCapabilities.has(providerId)) {
      this.providerCapabilities.set(providerId, new Set())
    }
    this.providerCapabilities.get(providerId)!.add(capabilityId)
  }

  // ── Queries ──

  get(id: string): CapabilityDefinition | undefined {
    return this.definitions.get(id)
  }

  getAll(category?: CapabilityCategory): CapabilityDefinition[] {
    const defs = Array.from(this.definitions.values())
    return category ? defs.filter(d => d.category === category) : defs
  }

  getForProvider(providerId: string): CapabilityDefinition[] {
    const caps = this.providerCapabilities.get(providerId)
    if (!caps) return []
    return Array.from(caps).map(id => this.definitions.get(id)!).filter(Boolean)
  }

  hasCapability(providerId: string, capabilityId: string): boolean {
    const caps = this.providerCapabilities.get(providerId)
    return caps ? caps.has(capabilityId) : false
  }

  getHandler(id: string): CapabilityHandler | undefined {
    return this.handlers.get(id)
  }

  // ── Validation ──

  validateParams(capabilityId: string, params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const def = this.definitions.get(capabilityId)
    if (!def) return { valid: false, errors: [`Unknown capability: ${capabilityId}`] }

    const errors: string[] = []
    for (const param of def.params) {
      if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
        errors.push(`${param.name} is required`)
      }
      if (params[param.name] !== undefined && params[param.name] !== null) {
        const actual = typeof params[param.name]
        const expected = param.type === 'number' ? 'number' : param.type === 'boolean' ? 'boolean' : param.type === 'object' || param.type === 'array' ? 'object' : 'string'
        if (actual !== expected) {
          errors.push(`${param.name} expected ${expected}, got ${actual}`)
        }
      }
    }
    return { valid: errors.length === 0, errors }
  }
}

export const registry = new CapabilityRegistry()
