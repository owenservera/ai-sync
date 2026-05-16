import { idb } from './idb'

export class LiveStorage {
  static defaultValue = Symbol('LIVE_STORAGE_DEFAULT')

  static async get<T extends Record<string, any>>(shape: T): Promise<T> {
    const result: any = {}
    for (const [key, defaultValue] of Object.entries(shape)) {
      const stored = await this._getKey(key)
      result[key] = stored !== undefined ? stored : defaultValue
    }
    return result as T
  }

  static async set(key: string, value: any): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  }

  private static async _getKey(key: string): Promise<any> {
    const data = await chrome.storage.local.get(key)
    return data[key]
  }
}
