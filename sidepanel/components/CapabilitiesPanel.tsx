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
import { Loader2, Play, CheckCircle2, XCircle, Clock, ExternalLink, Search, RefreshCw, Trash2, Edit3, Plus, FileText, Sparkles, Database, WifiOff } from 'lucide-react'

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

function CapabilityCard({ cap }: { cap: typeof CAPABILITIES[0] }) {
  const { activeProvider } = useAppStore()
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
      const payload: Record<string, unknown> = { providerId: activeProvider, ...formValues }

      if (cap.id === 'list') {
        payload.cursor = formValues.cursor || undefined
        payload.limit = formValues.limit ? parseInt(formValues.limit) : undefined
      }
      if (cap.id === 'fetch' || cap.id === 'edit' || cap.id === 'delete' || cap.id === 'url') {
        payload.conversationId = formValues.conversationId || ''
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
        </div>

        {status === 'success' && <ResultDisplay result={result} />}
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
