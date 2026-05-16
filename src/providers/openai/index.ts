import { type ConversationProvider } from '../provider-interface'
import {
  type ProviderConfig,
  type Account,
  type AuthProfile,
  type Header,
  type Conversation,
  type PaginatedResult,
  type SearchResult,
} from '../../types'

const SERVICE_ID = 'openai'
const DOMAIN = 'chatgpt.com'

export class OpenAIProvider implements ConversationProvider {
  readonly id = SERVICE_ID
  readonly name = 'ChatGPT'
  readonly config: ProviderConfig = {
    id: SERVICE_ID,
    name: 'ChatGPT',
    domain: DOMAIN,
    origins: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    capabilities: [
      { type: 'conversation-list', label: 'List Conversations', description: 'List all ChatGPT conversations' },
      { type: 'message-fetch', label: 'Fetch Messages', description: 'Download full conversation history' },
    ],
  }

  async init(): Promise<void> {}
  async destroy(): Promise<void> {}

  async detectAccounts(): Promise<Account[]> { return [] }
  async refreshAuth(_account: Account): Promise<AuthProfile | null> { return null }
  async isAuthenticated(_account: Account): Promise<boolean> { return false }

  async listConversations(_account: Account, _cursor?: string, _limit?: number): Promise<PaginatedResult<Header>> {
    throw new Error('OpenAI provider not yet implemented')
  }

  async getConversation(_account: Account, _conversationId: string): Promise<Conversation | null> {
    throw new Error('OpenAI provider not yet implemented')
  }

  async search(_account: Account, _query: string): Promise<SearchResult[]> {
    throw new Error('OpenAI provider not yet implemented')
  }

  async getChatUrl(_conversation: Header): Promise<string> {
    throw new Error('OpenAI provider not yet implemented')
  }

  async ping(_account: Account): Promise<boolean> { return false }

  hasCapability(type: string): boolean {
    return this.config.capabilities.some(c => c.type === type)
  }
}
