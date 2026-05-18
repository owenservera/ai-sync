import { log, logError } from '../../src/log'

export function sendMessage<T = unknown>(message: Record<string, unknown>): Promise<T> {
  const extensionId = chrome.runtime.id
  log('MESSAGING', `sendMessage: ${message.type}`)
  return chrome.runtime.sendMessage(extensionId, message)
}

export async function testCapability<T = unknown>(
  type: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const fullMsg = { type, ...payload }
  log('MESSAGING', `testCapability sending: ${type}`)
  
  // Add explicit extension ID targeting for MV3 service worker communication
  const extensionId = chrome.runtime.id
  log('MESSAGING', `using extensionId: ${extensionId}`)
  
  try {
    const result = await chrome.runtime.sendMessage(extensionId, fullMsg)
    log('MESSAGING', `testCapability resolved: ${type}`)
    return result
  } catch (e) {
    logError('MESSAGING', `testCapability error: ${type}`, e)
    throw e
  }
}

export function executeCapability<T = unknown>(
  providerId: string,
  capabilityId: string,
  accountId?: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const extensionId = chrome.runtime.id
  log('MESSAGING', `executeCapability: ${providerId}/${capabilityId}`)
  return chrome.runtime.sendMessage(extensionId, {
    type: 'CAPABILITY_EXECUTE',
    providerId,
    capabilityId,
    accountId,
    ...params,
  })
}
