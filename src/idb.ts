import Dexie, { type Table } from 'dexie'
import { type Account, type Org, OrgStatus, type Header, type Conversation, type ServiceState } from './types'
import { AccountStatus } from './types'

class ConversationArchiveDB extends Dexie {
  headers!: Table<Header, string>
  accounts!: Table<Account, string>
  orgs!: Table<Org, string>
  conversations!: Table<Conversation, string>
  services!: Table<ServiceState, string>
  settings!: Table<{ key: string; value: any }, string>

  constructor() {
    super('ConversationArchive')

    this.version(1).stores({
      headers: 'id, orgId, accountId, serviceId, updated',
      accounts: 'id, serviceId, email',
      orgs: 'id, serviceId, accountId, email',
      conversations: 'id, orgId, serviceId, updated',
      services: 'id',
    })

    // Schema v2: merged Org into Account, removed services table
    this.version(2).stores({
      accounts: 'id, serviceId, email, status',
      headers: 'id, accountId, serviceId, updated',
      conversations: 'id, accountId, serviceId, updated',
      settings: 'key',
    }).upgrade(async (tx) => {
      // Migrate Org data into Account records
      const orgs = await tx.table('orgs').toArray()
      for (const org of orgs) {
        const account = await tx.table('accounts').get(org.accountId)
        if (account) {
          await tx.table('accounts').update(org.accountId, {
            ...account,
            status: org.status === 'inactive' ? 'expired' : 'active',
          })
        }
      }

      // Migrate services.current to settings
      const services = await tx.table('services').toArray()
      for (const svc of services) {
        if (svc.current?.accountId) {
          await tx.table('settings').put({
            key: `activeAccountId.${svc.id}`,
            value: svc.current.accountId,
          })
        }
      }
    })

    // Attach helper methods
    this.orgs = this._extendOrgs(this.orgs)
    this.accounts = this._extendAccounts(this.accounts)
  }

  private _extendOrgs(orgs: Table<Org, string>): Table<Org, string> & OrgExtensions {
    const self = this
    const extensions: OrgExtensions = {
      isActive(org: Org): boolean {
        return org.status === OrgStatus.Active || org.status === OrgStatus.New
      },
      async updateCounts(orgId: string): Promise<void> {
        const count = await self.headers.where('orgId').equals(orgId).count()
        const org = await orgs.get(orgId)
        if (org) {
          await orgs.update(orgId, { ...org } as any)
        }
      },
    }
    return Object.assign(orgs, extensions)
  }

  private _extendAccounts(accounts: Table<Account, string>): Table<Account, string> & AccountExtensions {
    const extensions: AccountExtensions = {
      async findDuplicate(email: string, serviceId: string): Promise<Account | undefined> {
        return accounts
          .filter(a => a.email === email && a.serviceId === serviceId)
          .first()
      },
      async createOrUpdate(data: Partial<Account>): Promise<Account> {
        const existing = data.id ? await accounts.get(data.id) : undefined
        if (existing) {
          await accounts.update(data.id!, data)
          return { ...existing, ...data } as Account
        }
        const id = data.id || crypto.randomUUID()
        const account: Account = {
          id,
          serviceId: data.serviceId || '',
          index: data.index ?? 0,
          email: data.email || '',
          name: data.name,
          status: data.status ?? AccountStatus.Discovered,
          lastVerified: data.lastVerified ?? Date.now(),
          lastSync: data.lastSync ?? null,
        }
        await accounts.put(account)
        return account
      },
    }
    return Object.assign(accounts, extensions)
  }
}

interface OrgExtensions {
  isActive(org: Org): boolean
  updateCounts(orgId: string): Promise<void>
}

interface AccountExtensions {
  findDuplicate(email: string, serviceId: string): Promise<Account | undefined>
  createOrUpdate(data: Partial<Account>): Promise<Account>
}

export const idb = new ConversationArchiveDB()

// Re-export status for convenience
export { OrgStatus }
