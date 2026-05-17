export function sendMessage<T = unknown>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message)
}

export async function testCapability<T = unknown>(
  type: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  return chrome.runtime.sendMessage({ type, ...payload })
}

export function executeCapability<T = unknown>(
  providerId: string,
  capabilityId: string,
  accountId?: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  return chrome.runtime.sendMessage({
    type: 'CAPABILITY_EXECUTE',
    providerId,
    capabilityId,
    accountId,
    ...params,
  })
}
