import { create } from 'zustand'

interface ProviderState {
  id: string
  name: string
  connected: boolean
  conversationCount: number
  lastSync: number | null
  isSyncing: boolean
  isRateLimited: boolean
  capabilities?: Array<{ type: string; label: string; description: string }>
}

interface Header {
  id: string
  title: string
  updated: number
}

interface Conversation {
  id: string
  title: string
  messages?: Array<{ role: string; content: string }>
}

interface SearchResult {
  id: string
  title: string
  updated: number
}

interface TestResult {
  capability: string
  status: 'idle' | 'loading' | 'success' | 'error'
  data?: unknown
  error?: string
  timestamp?: number
}

interface AppState {
  activeTab: string
  activeProvider: string
  providers: ProviderState[]
  conversations: Header[]
  selectedConversation: Conversation | null
  searchResults: SearchResult[]
  testResults: Record<string, TestResult>
  isLoading: boolean
  error: string | null

  setActiveTab: (tab: string) => void
  setActiveProvider: (id: string) => void
  setProviders: (providers: ProviderState[]) => void
  setConversations: (conversations: Header[]) => void
  setSelectedConversation: (conv: Conversation | null) => void
  setSearchResults: (results: SearchResult[]) => void
  setTestResult: (capability: string, result: Omit<TestResult, 'capability'>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'overview',
  activeProvider: 'gemini',
  providers: [],
  conversations: [],
  selectedConversation: null,
  searchResults: [],
  testResults: {},
  isLoading: false,
  error: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveProvider: (id) => set({ activeProvider: id }),
  setProviders: (providers) => set({ providers }),
  setConversations: (conversations) => set({ conversations }),
  setSelectedConversation: (conv) => set({ selectedConversation: conv }),
  setSearchResults: (results) => set({ searchResults: results }),
  setTestResult: (capability, result) =>
    set((state) => ({
      testResults: {
        ...state.testResults,
        [capability]: { ...result, capability, timestamp: Date.now() },
      },
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
