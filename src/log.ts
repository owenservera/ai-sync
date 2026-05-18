const PREFIX = '[ConversationArchive]'

// Debug mode — gates log/logInfo/logWarn.
// Errors are always logged regardless.
let debugMode = false

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
}

export function log(...args: any[]): void {
  if (!debugMode) return
  console.log(PREFIX, ...args)
}

export function logInfo(...args: any[]): void {
  if (!debugMode) return
  console.info(PREFIX, ...args)
}

export function logWarn(...args: any[]): void {
  if (!debugMode) return
  console.warn(PREFIX, ...args)
}

export function logError(...args: any[]): void {
  // Errors are always logged, regardless of debug mode
  console.error(PREFIX, ...args)
}

// Rate limit event emitter (notifications to UI)
type RateLimitListener = (serviceId: string, isLimited: boolean) => void
const rateLimitListeners: RateLimitListener[] = []

export function onRateLimitChange(listener: RateLimitListener): void {
  rateLimitListeners.push(listener)
}

export function emitRateLimitEvent(serviceId: string, isLimited: boolean): void {
  for (const listener of rateLimitListeners) {
    listener(serviceId, isLimited)
  }
}
