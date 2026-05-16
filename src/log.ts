const PREFIX = '[ConversationArchive]'

export function log(...args: any[]): void {
  console.log(PREFIX, ...args)
}

export function logInfo(...args: any[]): void {
  console.info(PREFIX, ...args)
}

export function logWarn(...args: any[]): void {
  console.warn(PREFIX, ...args)
}

export function logError(...args: any[]): void {
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
