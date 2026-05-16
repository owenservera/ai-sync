export function sendMessage<T = unknown>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message)
}

export async function testCapability<T = unknown>(
  type: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  return chrome.runtime.sendMessage({ type, ...payload })
}
