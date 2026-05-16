import { type ConversationProvider } from './provider-interface'

const providers = new Map<string, ConversationProvider>()

export function registerProvider(provider: ConversationProvider): void {
  providers.set(provider.id, provider)
}

export function getProvider(id: string): ConversationProvider | undefined {
  return providers.get(id)
}

export function getAllProviders(): ConversationProvider[] {
  return Array.from(providers.values())
}

export function getProvidersWithCapability(capability: string): ConversationProvider[] {
  return getAllProviders().filter(p => p.hasCapability(capability))
}
