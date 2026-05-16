import { type ProviderState, type Header, type Conversation } from '../src/types'

let currentProviderId = 'gemini'

document.addEventListener('DOMContentLoaded', () => {
  const syncAllBtn = document.getElementById('syncAllBtn')!
  const searchBtn = document.getElementById('searchBtn')!
  const searchInput = document.getElementById('searchInput') as HTMLInputElement
  const backBtn = document.getElementById('backBtn')!

  syncAllBtn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'SYNC_PROVIDER', providerId: currentProviderId }))
  searchBtn.addEventListener('click', () => loadConversations(searchInput.value))
  backBtn.addEventListener('click', () => showView('conversations'))

  loadProviderState()
  loadConversations()

  // Periodic refresh
  setInterval(loadProviderState, 5000)
})

async function loadProviderState(): Promise<void> {
  const state: ProviderState[] = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  const container = document.getElementById('providerList')!
  container.innerHTML = state.map(p => `
    <div class="provider-card ${p.id === currentProviderId ? 'active' : ''}" data-provider="${p.id}">
      <div>
        <div class="name">${p.name}</div>
        <div class="status ${p.connected ? 'connected' : ''}">
          ${p.connected ? `${p.conversationCount} conversations` : 'Not connected'}
          ${p.isSyncing ? ' (syncing...)' : ''}
          ${p.isRateLimited ? ' (rate limited)' : ''}
        </div>
      </div>
      <button class="btn sync-btn" data-action="sync">Sync</button>
    </div>
  `).join('')

  container.querySelectorAll('[data-action="sync"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.provider-card')!
      const providerId = card.getAttribute('data-provider')!
      currentProviderId = providerId
      chrome.runtime.sendMessage({ type: 'SYNC_PROVIDER', providerId })
    })
  })

  container.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return
      currentProviderId = card.getAttribute('data-provider')!
      loadConversations()
    })
  })
}

async function loadConversations(searchQuery?: string): Promise<void> {
  const container = document.getElementById('conversationList')!
  container.innerHTML = '<div style="padding:20px;text-align:center;color:#5f6368">Loading...</div>'

  try {
    const state: ProviderState[] = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
    const providerState = state.find(p => p.id === currentProviderId)
    if (!providerState || !providerState.connected) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#5f6368">Provider not connected. Sign in to view conversations.</div>'
      return
    }

    // In a full implementation, this would query IndexedDB directly
    // For the POC skeleton, we show the provider is connected
    container.innerHTML = `
      <div style="padding:20px;text-align:center;color:#5f6368">
        ${providerState.conversationCount} conversations cached.<br>
        Click "Sync" to download conversations.
      </div>
    `
  } catch (error) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:#d93025">Error: ${(error as Error).message}</div>`
  }
}

function showView(view: 'conversations' | 'detail'): void {
  document.getElementById('conversations')!.style.display = view === 'conversations' ? 'block' : 'none'
  document.getElementById('detail')!.style.display = view === 'detail' ? 'block' : 'none'
}

function showError(message: string): void {
  const container = document.getElementById('conversationList')!
  container.innerHTML = `<div style="padding:16px;background:#fce8e6;border-radius:8px;color:#c5221f">${message}</div>`
}
