import { create } from 'zustand'
import { testCapability } from '@/lib/messaging'
import { extractMediaFromMessages } from '@/lib/media-extract'
import type { MediaItem } from '@/lib/media-extract'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  media?: MediaItem[]
}

export interface ConversationInfo {
  id: string
  title: string
  updated: number
  gemName?: string
}

interface ChatState {
  activeConversationId: string | null
  activeConversationTitle: string
  messages: ChatMessage[]
  mediaItems: MediaItem[]

  isSending: boolean
  isLoadingConversation: boolean
  error: string | null

  conversations: ConversationInfo[]
  searchQuery: string

  setActiveConversation: (id: string | null, title?: string) => void
  setMessages: (messages: ChatMessage[]) => void
  setMediaItems: (media: MediaItem[]) => void
  setSending: (sending: boolean) => void
  setLoadingConversation: (loading: boolean) => void
  setError: (error: string | null) => void
  setConversations: (conversations: ConversationInfo[]) => void
  setSearchQuery: (query: string) => void

  loadConversations: () => Promise<void>
  loadConversation: (conversationId: string, title?: string) => Promise<void>
  sendMessage: (providerId: string, accountId: string | undefined, text: string) => Promise<void>
  startNewChat: () => void
}

function messagesToChatMessages(rawMessages: any[]): ChatMessage[] {
  return (rawMessages || [])
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content || '',
      timestamp: m.timestamp || Date.now(),
    }))
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeConversationId: null,
  activeConversationTitle: '',
  messages: [],
  mediaItems: [],
  isSending: false,
  isLoadingConversation: false,
  error: null,
  conversations: [],
  searchQuery: '',

  setActiveConversation: (id, title) =>
    set({ activeConversationId: id, activeConversationTitle: title || '' }),
  setMessages: (messages) => set({ messages }),
  setMediaItems: (media) => set({ mediaItems: media }),
  setSending: (sending) => set({ isSending: sending }),
  setLoadingConversation: (loading) => set({ isLoadingConversation: loading }),
  setError: (error) => set({ error }),
  setConversations: (conversations) => set({ conversations }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  async loadConversations() {
    const { activeConversationId } = get()
    try {
      const headers: any[] = await testCapability('GET_ALL_HEADERS', {
        serviceId: 'gemini',
      })
      const conversations = (headers || []).map((h: any) => ({
        id: h.id,
        title: h.title || 'Untitled',
        updated: h.updated || 0,
        gemName: h.gemName,
      }))
      set({ conversations })

      if (activeConversationId) {
        const conv = conversations.find((c: any) => c.id === activeConversationId)
        if (conv) {
          await get().loadConversation(conv.id, conv.title)
        }
      }
    } catch (e: any) {
      set({ error: e.message || 'Failed to load conversations' })
    }
  },

  async loadConversation(conversationId: string, title?: string) {
    set({ isLoadingConversation: true, error: null })
    try {
      const result = await testCapability('TEST_FETCH_CONTENT', {
        providerId: 'gemini',
        conversationId,
      })
      const rawMessages = result?.messages || []
      const chatMessages = messagesToChatMessages(rawMessages)
      const media = extractMediaFromMessages(rawMessages)
      set({
        activeConversationId: conversationId,
        activeConversationTitle: title || result?.title || '',
        messages: chatMessages,
        mediaItems: media,
      })
    } catch (e: any) {
      set({ error: e.message || 'Failed to load conversation' })
    } finally {
      set({ isLoadingConversation: false })
    }
  },

  async sendMessage(providerId: string, accountId: string | undefined, text: string) {
    if (!text.trim()) return

    const { messages } = get()
    const userMsgId = `local-${Date.now()}-user`

    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }
    set({
      messages: [...messages, userMsg],
      isSending: true,
      error: null,
    })

    try {
      const result = await testCapability('TEST_CREATE_CONVERSATION', {
        providerId,
        accountId,
        prompt: text.trim(),
      })

      const conversationId = result?.id
      const responseText = result?.response || ''

      const assistantMsg: ChatMessage = {
        id: `local-${Date.now()}-assistant`,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
      }
      set((state) => ({
        messages: [...state.messages, assistantMsg],
        isSending: false,
        activeConversationId: conversationId || state.activeConversationId,
        activeConversationTitle: result?.title || state.activeConversationTitle,
      }))

      try {
        await testCapability('SYNC_PROVIDER', {
          providerId,
          accountId,
        })
      } catch {
      }

      await get().loadConversations()
    } catch (e: any) {
      set({
        isSending: false,
        error: e.message || 'Failed to send message',
        messages: messages,
      })
    }
  },

  startNewChat() {
    set({
      activeConversationId: null,
      activeConversationTitle: '',
      messages: [],
      mediaItems: [],
      error: null,
    })
  },
}))
