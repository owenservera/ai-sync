// src/capabilities/index.ts
// Public exports for the capability engine.

export { registry } from './registry'
export { engine } from './engine'
export type {
  CapabilityCategory,
  ParamType,
  CapabilityParam,
  CapabilityDefinition,
  HandlerContext,
  CapabilityHandler,
} from './types'
export type { ExecuteParams } from './engine'
export { ALL_CAPABILITY_DEFINITIONS } from './definitions'
