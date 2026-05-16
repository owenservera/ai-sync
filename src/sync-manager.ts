import { type ConversationProvider } from './providers/provider-interface'
import { getProvider, getAllProviders } from './providers/provider-registry'
import { idb } from './idb'
import { log, logError, logInfo } from './log'
import { type Org, type Header, type Account, OrgStatus } from './types'

export class SyncManager {
  private activeSyncs = new Map<string, boolean>()
  private listeners: Array<(event: SyncEvent) => void> = []

  onEvent(callback: (event: SyncEvent) => void): void {
    this.listeners.push(callback)
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  async syncAll(): Promise<void> {
    const providers = getAllProviders()
    for (const provider of providers) {
      if (!provider.hasCapability('conversation-list')) continue
      const accounts = await provider.detectAccounts()
      for (const account of accounts) {
        await this.syncProvider(provider, account)
      }
    }
  }

  async syncProvider(provider: ConversationProvider, account: Account): Promise<void> {
    const syncKey = `${provider.id}:${account.id}`
    if (this.activeSyncs.get(syncKey)) {
      log('SyncManager', `Sync already in progress: ${syncKey}`)
      return
    }

    this.activeSyncs.set(syncKey, true)
    this.emit({ type: 'sync-start', providerId: provider.id, accountId: account.id })

    try {
      let cursor: string | undefined
      let totalFetched = 0

      do {
        const result = await provider.listConversations(account, cursor)
        const headers = result.items

        for (const header of headers) {
          const existing = await idb.headers.get(header.id)
          if (!existing || existing.updated < header.updated) {
            await idb.headers.put({
              ...header,
              orgId: account.id,
              accountId: account.id,
              serviceId: provider.id,
            })
            totalFetched++
          }
        }

        cursor = result.next
      } while (cursor)

      this.emit({ type: 'sync-complete', providerId: provider.id, accountId: account.id, count: totalFetched })
      logInfo('SyncManager', `Sync complete | provider: ${provider.id} | account: ${account.id} | new: ${totalFetched}`)
    } catch (error: any) {
      this.emit({ type: 'sync-error', providerId: provider.id, accountId: account.id, error: error.message })
      logError('SyncManager', `Sync failed | provider: ${provider.id} | error: ${error.message}`)
    } finally {
      this.activeSyncs.delete(syncKey)
    }
  }

  async syncConversation(provider: ConversationProvider, account: Account, conversationId: string): Promise<void> {
    try {
      this.emit({ type: 'sync-conversation-start', providerId: provider.id, accountId: account.id, conversationId })

      const conversation = await provider.getConversation(account, conversationId)
      if (conversation) {
        await idb.conversations.put(conversation)
        this.emit({ type: 'sync-conversation-complete', providerId: provider.id, accountId: account.id, conversationId })
      }
    } catch (error: any) {
      logError('SyncManager', `Conversation sync failed | id: ${conversationId} | error: ${error.message}`)
      this.emit({ type: 'sync-error', providerId: provider.id, accountId: account.id, error: error.message })
    }
  }

  isSyncing(providerId: string, accountId: string): boolean {
    return !!this.activeSyncs.get(`${providerId}:${accountId}`)
  }
}

export interface SyncEvent {
  type: 'sync-start' | 'sync-complete' | 'sync-error' | 'sync-conversation-start' | 'sync-conversation-complete'
  providerId: string
  accountId: string
  conversationId?: string
  count?: number
  error?: string
}

export const syncManager = new SyncManager()
