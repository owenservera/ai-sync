import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useAccount } from '@/contexts/AccountContext'
import { useAppStore } from '@/stores/appStore'
import { AccountSelector } from './AccountSelector'
import { MediaGallery } from './MediaGallery'
import { Button } from './ui/button'
import { Textarea } from './ui/input'
import { Badge } from './ui/badge'
import {
  Send,
  Plus,
  MessageSquare,
  Loader2,
  AlertCircle,
  Sparkles,
  Clock,
  ArrowLeft,
  RefreshCw,
  Image,
} from 'lucide-react'
import { extractMediaFromMessages } from '@/lib/media-extract'

function formatTime(ts: number) {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function renderMarkdown(text: string): string {
  if (!text) return ''

  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const codeBlocks: string[] = []
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length
    codeBlocks.push(`<pre class="chat-codeblock"><code class="chat-codeblock-lang">${lang || ''}</code>${code.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')}</pre>`)
    return `%%CODEBLOCK_${idx}%%`
  })

  result = result
    .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')

  result = result
    .split('\n')
    .map((line) => {
      if (line.startsWith('%%CODEBLOCK_')) {
        const idx = parseInt(line.match(/%%CODEBLOCK_(\d+)%%/)?.[1] || '0')
        return codeBlocks[idx] || line
      }
      return line.trim() === '' ? '<br/>' : `<p class="chat-text-line">${line}</p>`
    })
    .join('')

  return result
}

function ChatMessageBubble({ message }: { message: { role: string; content: string; timestamp: number } }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        }`}
      >
        {!isUser && message.content.includes('%%CODEBLOCK_') || message.content.includes('<pre') ? (
          <div
            className="chat-markdown prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        ) : !isUser ? (
          <div
            className="chat-markdown prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        ) : (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}
        <div className={`text-[10px] mt-1.5 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Thinking...</span>
        </div>
      </div>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">Start a new conversation</h2>
          <p className="text-sm text-muted-foreground">
            Type a message below to create a new chat. Responses are synced automatically from Gemini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          {['Summarize a topic', 'Write some code', 'Explain a concept', 'Generate an image'].map((suggestion) => (
            <Badge key={suggestion} variant="secondary" className="text-xs">
              {suggestion}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

function ConversationSidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const {
    conversations,
    searchQuery,
    setSearchQuery,
    activeConversationId,
    setActiveConversation,
    loadConversation,
    loadConversations,
  } = useChatStore()

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div
      className={`absolute inset-y-0 left-0 z-20 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-semibold truncate">Conversations</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => loadConversations()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="px-3 py-2">
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-8 px-2.5 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No conversations yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => {
                  loadConversation(conv.id, conv.title)
                  onClose()
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                  conv.id === activeConversationId
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <div className="truncate font-medium">{conv.title || 'Untitled'}</div>
                <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{formatTime(conv.updated)}</span>
                  {conv.gemName && (
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {conv.gemName}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function AIChatPanel() {
  const { activeAccount } = useAccount()
  const { activeProvider } = useAppStore()
  const {
    messages,
    mediaItems,
    isSending,
    isLoadingConversation,
    error,
    activeConversationId,
    activeConversationTitle,
    conversations,
    setError,
    setMessages,
    setMediaItems,
    setActiveConversation,
    sendMessage,
    startNewChat,
    loadConversation,
    loadConversations,
  } = useChatStore()

  const [inputText, setInputText] = useState('')
  const [showSidebar, setShowSidebar] = useState(false)
  const [showMedia, setShowMedia] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    loadConversations()
  }, [activeProvider])

  async function handleSend() {
    const trimmed = inputText.trim()
    if (!trimmed || isSending) return

    setInputText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await sendMessage(activeProvider, activeAccount?.id || undefined, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleTextareaResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  async function handleSync() {
    await loadConversations()
    if (activeConversationId) {
      const conv = conversations.find((c) => c.id === activeConversationId)
      if (conv) {
        await loadConversation(conv.id, conv.title)
      }
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      <AccountSelector />

      <ConversationSidebar isOpen={showSidebar} onClose={() => setShowSidebar(false)} />

      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => setShowSidebar(true)}>
            <MessageSquare className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">
              {activeConversationTitle || 'New Chat'}
            </h2>
            {activeConversationId && (
              <p className="text-[10px] text-muted-foreground truncate">
                {conversations.length} conversations
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {activeConversationId && mediaItems.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowMedia(!showMedia)}>
              <Image className="w-3.5 h-3.5 mr-1" />
              {mediaItems.length}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSync}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startNewChat}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {isLoadingConversation ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <WelcomeScreen />
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {isSending && <TypingIndicator />}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs mb-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-6 text-xs"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
            {showMedia && mediaItems.length > 0 && (
              <div className="mt-2">
                <MediaGallery media={mediaItems} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-border bg-card p-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaResize}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="resize-none pr-10 min-h-[40px] max-h-[160px]"
              disabled={isSending}
            />
          </div>
          <Button
            size="icon"
            className="h-10 w-10 flex-shrink-0 rounded-full"
            disabled={!inputText.trim() || isSending}
            onClick={handleSend}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for new line
          </span>
          {activeConversationId && (
            <span className="text-[10px] text-muted-foreground">
              Synced to Gemini
            </span>
          )}
        </div>
      </div>

      <style>{`
        .chat-markdown .chat-text-line { margin: 0; line-height: 1.6; }
        .chat-markdown .chat-text-line:empty { display: none; }
        .chat-markdown .chat-codeblock { display: block; background: hsl(var(--muted)); border-radius: 6px; padding: 12px; margin: 8px 0; overflow-x: auto; font-size: 12px; font-family: ui-monospace, monospace; }
        .chat-markdown .chat-codeblock-lang { display: block; font-size: 10px; color: hsl(var(--muted-foreground)); margin-bottom: 4px; font-family: ui-monospace, monospace; }
        .chat-markdown .chat-inline-code { background: hsl(var(--muted)); padding: 1px 5px; border-radius: 3px; font-size: 0.875em; font-family: ui-monospace, monospace; }
        .chat-markdown strong { font-weight: 600; }
        .chat-markdown p { margin: 0; }
        .chat-markdown pre { margin: 0; }
      `}</style>
    </div>
  )
}
