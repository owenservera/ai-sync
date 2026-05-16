import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/appStore'
import { testCapability } from '@/lib/messaging'
import { Loader2, Play, CheckCircle2, XCircle, Clock, ExternalLink, Search, RefreshCw, Trash2, Edit3, Plus, FileText, Sparkles, Database, WifiOff, Image, Download } from 'lucide-react'
import { MediaGallery } from './MediaGallery'

const CAPABILITIES = [
  { id: 'list', type: 'TEST_LIST_CONVERSATIONS', label: 'List Conversations', icon: Database, description: 'Paginated conversation list with cursor navigation' },
  { id: 'fetch', type: 'TEST_FETCH_CONTENT', label: 'Fetch Conversation', icon: FileText, description: 'Download full conversation with message pairs' },
  { id: 'edit', type: 'TEST_EDIT_TITLE', label: 'Edit Title', icon: Edit3, description: 'Rename a conversation' },
  { id: 'delete', type: 'TEST_DELETE_CONVERSATION', label: 'Delete Conversation', icon: Trash2, description: 'Remove a conversation from Gemini' },
  { id: 'create', type: 'TEST_CREATE_CONVERSATION', label: 'Create Conversation', icon: Plus, description: 'Start new chat with initial prompt' },
  { id: 'summary', type: 'TEST_FETCH_SUMMARY', label: 'Fetch Summary', icon: Sparkles, description: 'Get AI-generated text response (temp chat)' },
  { id: 'gems', type: 'TEST_FETCH_ALL_GEMS', label: 'Fetch All Gems', icon: Database, description: 'List conversations from custom Gemini assistants' },
  { id: 'search', type: 'TEST_SEARCH', label: 'Search Conversations', icon: Search, description: 'Text search across all conversations' },
  { id: 'sync', type: 'TEST_SYNC_MISSING', label: 'Sync Missing from Search', icon: RefreshCw, description: 'Download conversations not in local DB' },
  { id: 'ping', type: 'TEST_PING', label: 'Ping / Connectivity', icon: CheckCircle2, description: 'Check if provider is reachable' },
  { id: 'offline', type: 'TEST_IS_OFFLINE', label: 'Check Offline Status', icon: WifiOff, description: 'Verify if account is still authenticated' },
  { id: 'url', type: 'TEST_GET_CHAT_URL', label: 'Get Chat URL', icon: ExternalLink, description: 'Build Gemini URL for a conversation' },
  { id: 'downloadRaw', type: 'TEST_DOWNLOAD_RAW', label: 'Download Raw Data', icon: Database, description: 'Download N most recent conversations with raw API response, parsed messages, and media' },
  { id: 'media', type: 'TEST_DOWNLOAD_MEDIA', label: 'Download Media', icon: Image, description: 'Extract and download all media from a conversation' },
]

function ResultDisplay({ result }: { result: any }) {
  if (!result) return null
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
  return (
    <div className="h-48 mt-3 rounded-md border bg-muted/50 p-3 overflow-auto">
      <pre className="text-xs whitespace-pre-wrap break-all font-mono">{text}</pre>
    </div>
  )
}

function exportJson(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function CapabilityCard({ cap }: { cap: typeof CAPABILITIES[0] }) {
  const { activeProvider, activeAccountId } = useAppStore()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  const Icon = cap.icon

  function updateField(field: string, value: string) {
    setFormValues((prev) => ({ ...prev, [field]: value }))
  }

  async function runTest() {
    setStatus('loading')
    setResult(null)
    setError(null)

    try {
      const payload: Record<string, unknown> = { providerId: activeProvider, accountId: activeAccountId || undefined, ...formValues }

      if (cap.id === 'list') {
        payload.cursor = formValues.cursor || undefined
        payload.limit = formValues.limit ? parseInt(formValues.limit) : undefined
      }
      if (cap.id === 'media' || cap.id === 'downloadRaw') {
        payload.conversationId = formValues.conversationId || ''
      }
      if (cap.id === 'downloadRaw') {
        payload.count = formValues.count ? parseInt(formValues.count) : 1
      }
      if (cap.id === 'edit') {
        payload.title = formValues.title || ''
      }
      if (cap.id === 'create' || cap.id === 'summary') {
        payload.prompt = formValues.prompt || ''
      }
      if (cap.id === 'summary') {
        payload.systemPrompt = formValues.systemPrompt || undefined
      }
      if (cap.id === 'search') {
        payload.query = formValues.query || ''
      }
      if (cap.id === 'sync') {
        payload.searchResults = formValues.searchResults ? JSON.parse(formValues.searchResults) : []
      }
      if (cap.id === 'offline') {
        payload.accountId = formValues.accountId || ''
      }

      const data = await testCapability(cap.type, payload)
      setResult(data)
      setStatus('success')
    } catch (e: any) {
      setError(e.message || 'Unknown error')
      setStatus('error')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm">{cap.label}</CardTitle>
          </div>
          <Badge variant={status === 'success' ? 'success' : status === 'error' ? 'destructive' : status === 'loading' ? 'default' : 'secondary'}>
            {status === 'idle' && <Clock className="w-3 h-3 mr-1" />}
            {status === 'loading' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {status === 'success' && <CheckCircle2 className="w-3 h-3 mr-1" />}
            {status === 'error' && <XCircle className="w-3 h-3 mr-1" />}
            {status}
          </Badge>
        </div>
        <CardDescription className="text-xs">{cap.description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-2">
          {cap.id === 'list' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Cursor</Label>
                <Input placeholder="Optional cursor" value={formValues.cursor || ''} onChange={(e) => updateField('cursor', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Limit</Label>
                <Input type="number" placeholder="100" value={formValues.limit || ''} onChange={(e) => updateField('limit', e.target.value)} />
              </div>
            </div>
          )}
          {(cap.id === 'fetch' || cap.id === 'edit' || cap.id === 'delete' || cap.id === 'url') && (
            <div>
              <Label className="text-xs">Conversation ID</Label>
              <Input placeholder="c_xxx or xxx" value={formValues.conversationId || ''} onChange={(e) => updateField('conversationId', e.target.value)} />
            </div>
          )}
          {cap.id === 'edit' && (
            <div>
              <Label className="text-xs">New Title</Label>
              <Input placeholder="New title" value={formValues.title || ''} onChange={(e) => updateField('title', e.target.value)} />
            </div>
          )}
          {(cap.id === 'create' || cap.id === 'summary') && (
            <>
              <div>
                <Label className="text-xs">Prompt</Label>
                <Textarea placeholder="Enter prompt..." value={formValues.prompt || ''} onChange={(e) => updateField('prompt', e.target.value)} />
              </div>
              {cap.id === 'summary' && (
                <div>
                  <Label className="text-xs">System Prompt (optional)</Label>
                  <Textarea placeholder="System prompt..." value={formValues.systemPrompt || ''} onChange={(e) => updateField('systemPrompt', e.target.value)} />
                </div>
              )}
            </>
          )}
          {cap.id === 'search' && (
            <div>
              <Label className="text-xs">Search Query</Label>
              <Input placeholder="Search term..." value={formValues.query || ''} onChange={(e) => updateField('query', e.target.value)} />
            </div>
          )}
          {cap.id === 'sync' && (
            <div>
              <Label className="text-xs">Search Results (JSON array)</Label>
              <Textarea placeholder='[{"id":"xxx","title":"...","updated":123}]' value={formValues.searchResults || ''} onChange={(e) => updateField('searchResults', e.target.value)} />
            </div>
          )}
          {cap.id === 'offline' && (
            <div>
              <Label className="text-xs">Account ID</Label>
              <Input placeholder="Account ID" value={formValues.accountId || ''} onChange={(e) => updateField('accountId', e.target.value)} />
            </div>
          )}
          {cap.id === 'media' && (
            <div>
              <Label className="text-xs">Conversation ID</Label>
              <Input placeholder="c_xxx or xxx" value={formValues.conversationId || ''} onChange={(e) => updateField('conversationId', e.target.value)} />
            </div>
          )}
          {cap.id === 'downloadRaw' && (
            <div>
              <Label className="text-xs">Number of conversations (default: 1)</Label>
              <Input type="number" placeholder="1" value={formValues.count || '1'} onChange={(e) => updateField('count', e.target.value)} />
            </div>
          )}
        </div>

        {status === 'success' && cap.id === 'media' && result?.media && (
          <MediaGallery media={result.media} />
        )}
        {status === 'success' && cap.id === 'downloadRaw' && result?.conversations && (
          <>
            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              <Badge variant="secondary">Downloaded: {result.count}/{result.requested}</Badge>
              <Badge variant="secondary">Account: {result.accountEmail || result.accountId}</Badge>
            </div>
            {result.conversations.map((conv: any, i: number) => (
              <div key={i} className="mt-3 p-3 rounded-md border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium truncate">{conv.header?.title || conv.header?.id || 'Error'}</h4>
                  <div className="flex gap-1">
                    {conv.rawApiResponse && (
                      <Button size="sm" variant="outline" onClick={() => exportJson(conv.rawApiResponse, `raw_${conv.header?.id}`)}>
                        <Download className="w-3 h-3" />
                      </Button>
                    )}
                    {conv.parsedMessages && (
                      <Button size="sm" variant="outline" onClick={() => exportJson(conv.parsedMessages, `parsed_${conv.header?.id}`)}>
                        <Download className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {conv.error ? (
                  <p className="text-xs text-destructive">{conv.error}</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Messages: {conv.parsedMessages?.length || 0}</span>
                      <span>Media: {conv.media?.length || 0}</span>
                      <span>Raw API: {conv.rawApiResponse ? 'yes' : 'no'}</span>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw API Response</summary>
                      <pre className="mt-1 p-2 rounded bg-muted/50 overflow-auto max-h-48 text-[10px] whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(conv.rawApiResponse, null, 2)}
                      </pre>
                    </details>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Parsed Messages</summary>
                      <pre className="mt-1 p-2 rounded bg-muted/50 overflow-auto max-h-48 text-[10px] whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(conv.parsedMessages, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => exportJson(result, `download_raw_${Date.now()}`)}>
                <Download className="w-3 h-3 mr-1" /> Export All
              </Button>
            </div>
          </>
        )}
        {status === 'success' && cap.id !== 'downloadRaw' && <ResultDisplay result={result} />}
        {status === 'error' && (
          <div className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-xs">
            {error}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Button size="sm" onClick={runTest} disabled={status === 'loading'} className="w-full">
          {status === 'loading' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Run Test
        </Button>
      </CardFooter>
    </Card>
  )
}

export function CapabilitiesPanel() {
  return (
    <div className="p-4 space-y-3">
      <h2 className="text-base font-semibold mb-3">Capability Tests</h2>
      <div className="grid grid-cols-1 gap-3">
        {CAPABILITIES.map((cap) => (
          <CapabilityCard key={cap.id} cap={cap} />
        ))}
      </div>
    </div>
  )
}
