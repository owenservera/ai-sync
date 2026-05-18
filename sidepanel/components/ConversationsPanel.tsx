import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { testCapability } from '@/lib/messaging'
import { useAccount } from '@/contexts/AccountContext'
import { useAppStore } from '@/stores/appStore'
import { MessageSquare, ExternalLink, Search, RefreshCw, Loader2, Clock, Image } from 'lucide-react'
import { MediaGallery } from './MediaGallery'
import { AccountSelector } from './AccountSelector'
import { extractMediaFromMessages } from '@/lib/media-extract'
import type { MediaItem } from '@/lib/media-extract'

interface Header {
  id: string
  orgId: string
  accountId: string
  serviceId: string
  title: string
  created: number
  updated: number
  gemId?: string
  gemName?: string
}

export function ConversationsPanel() {
  const { activeAccount } = useAccount()
  const { activeProvider } = useAppStore()
  const [conversations, setConversations] = useState<Header[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingConversation, setViewingConversation] = useState<Header | null>(null)
  const [messages, setMessages] = useState<Array<{ role: string; content: string; timestamp: number }>>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [showMedia, setShowMedia] = useState(false)

  useEffect(() => {
    loadConversations()
  }, [activeProvider])

  async function loadConversations() {
    setLoading(true)
    try {
      const allConversations: Header[] = await testCapability('GET_ALL_HEADERS', { serviceId: activeProvider, accountId: activeAccount?.id || undefined })
      setConversations(Array.isArray(allConversations) ? allConversations : [])
    } catch (e) {
      console.error('Failed to load conversations:', e)
      setConversations([])
    } finally {
      setLoading(false)
    }
  }

  async function openConversation(conv: Header) {
    setViewingConversation(conv)
    setLoadingMessages(true)
    setMediaItems([])
    setShowMedia(false)
    try {
      const result = await testCapability<any>('TEST_FETCH_CONTENT', {
        providerId: activeProvider,
        conversationId: conv.id,
        accountId: activeAccount?.id || undefined,
      })
      setMessages(result?.messages || [])

      // Extract media from messages
      const msgs = result?.messages || []
      const extracted = extractMediaFromMessages(msgs)
      setMediaItems(extracted)
    } catch (e: any) {
      console.error('Failed to fetch conversation:', e)
    } finally {
      setLoadingMessages(false)
    }
  }

  async function openInGemini(conv: Header) {
    try {
      const url = await testCapability<string>('TEST_GET_CHAT_URL', {
        providerId: activeProvider,
        conversationId: conv.id,
      })
      window.open(url, '_blank')
    } catch (e: any) {
      console.error('Failed to get chat URL:', e)
    }
  }

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

  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (viewingConversation) {
    return (
      <div className="flex flex-col h-full">
        <AccountSelector />
        <div className="p-4 space-y-3 flex-1 overflow-auto">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => { setViewingConversation(null); setMessages([]); setMediaItems([]); setShowMedia(false) }}>
            &larr; Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => openInGemini(viewingConversation)}>
            <ExternalLink className="w-4 h-4 mr-1" />
            Open in Gemini
          </Button>
        </div>

        <h2 className="text-base font-semibold truncate">{viewingConversation.title}</h2>
        <p className="text-xs text-muted-foreground">Updated {formatTime(viewingConversation.updated)}</p>
        {mediaItems.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowMedia(!showMedia)}>
            <Image className="w-4 h-4 mr-1" />
            {showMedia ? 'Hide' : 'Show'} Media ({mediaItems.length})
          </Button>
        )}
        <Separator />

        {loadingMessages ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No messages found.</div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-primary/10 ml-0 mr-8' : 'bg-muted ml-8 mr-0'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-[10px]">
                    {msg.role}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="whitespace-pre-wrap break-words">{msg.content || '(empty)'}</div>
              </div>
            ))}
          </div>
        )}

        {showMedia && <MediaGallery media={mediaItems} />}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <AccountSelector />
      <div className="p-4 space-y-3 flex-1 overflow-auto">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={loadConversations} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} conversations</p>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No synced conversations yet.</p>
          <p className="text-xs mt-1">Click Sync on the Overview tab to download conversations.</p>
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.map((conv) => (
          <Card
            key={conv.id}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => openConversation(conv)}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{conv.title || 'Untitled'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{formatTime(conv.updated)}</span>
                    {conv.gemName && (
                      <Badge variant="outline" className="text-[10px]">{conv.gemName}</Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); openInGemini(conv) }}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      </div>
    </div>
  )
}
