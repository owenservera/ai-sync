import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { testCapability } from '@/lib/messaging'
import { Activity, Trash2, Circle } from 'lucide-react'

interface LogEntry {
  id: string
  timestamp: number
  rpcId: string
  url: string
  method: string
  category: string
  syncTriggered: boolean
  status: string
}

const RPC_CATEGORIES: Record<string, string> = {
  MaZiqc: 'List Conversations',
  hNvQHb: 'Fetch Messages',
  MUAZcd: 'Edit Title',
  GzXR5e: 'Delete',
  PCck7e: 'Stream/Summary',
  qWymEb: 'Modify',
  CNgdBe: 'List Gems',
  HcT8bb: 'Modify',
  unqWSc: 'Search',
  o30O0e: 'Profile',
}

const MOCK_LOGS: LogEntry[] = [
  { id: '1', timestamp: Date.now() - 5000, rpcId: 'MaZiqc', url: 'https://gemini.google.com/_/BardChatUi/data/...', method: 'POST', category: 'List Conversations', syncTriggered: false, status: '200' },
  { id: '2', timestamp: Date.now() - 3000, rpcId: 'hNvQHb', url: 'https://gemini.google.com/_/BardChatUi/data/...', method: 'POST', category: 'Fetch Messages', syncTriggered: false, status: '200' },
  { id: '3', timestamp: Date.now() - 1000, rpcId: 'MUAZcd', url: 'https://gemini.google.com/_/BardChatUi/data/...', method: 'POST', category: 'Edit Title', syncTriggered: true, status: '200' },
]

export function NetworkLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      loadLogs()
    }, 3000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  async function loadLogs() {
    try {
      const result = await testCapability('GET_NETWORK_LOGS')
      if (result?.logs) setLogs(result.logs)
    } catch {
      // Keep mock logs if no real data
    }
  }

  function clearLogs() {
    setLogs([])
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString()
  }

  function getCategoryColor(category: string) {
    if (category.includes('List')) return 'default'
    if (category.includes('Edit') || category.includes('Delete')) return 'destructive'
    if (category.includes('Stream')) return 'warning'
    return 'secondary'
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Network Monitor</h2>
        </div>
        <div className="flex gap-2">
          <Button variant={autoRefresh ? 'default' : 'outline'} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            <Circle className={`w-3 h-3 mr-1 ${autoRefresh ? 'fill-current animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Auto'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadLogs}>Refresh</Button>
          <Button variant="outline" size="sm" onClick={clearLogs}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Intercepted RPCs</CardTitle>
          <CardDescription>Network requests to gemini.google.com</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 overflow-auto">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No network activity captured yet.
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 rounded-md border bg-card/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={getCategoryColor(log.category) as any} className="text-[10px] font-mono">
                          {log.rpcId}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{log.category}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatTime(log.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{log.method}</span>
                      <Separator orientation="vertical" className="h-3" />
                      <span className="truncate max-w-[200px] font-mono">{log.url}</span>
                      <Separator orientation="vertical" className="h-3" />
                      <span className={log.status.startsWith('2') ? 'text-green-500' : 'text-red-500'}>
                        {log.status}
                      </span>
                      {log.syncTriggered && (
                        <>
                          <Separator orientation="vertical" className="h-3" />
                          <Badge variant="success" className="text-[10px]">Sync Triggered</Badge>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">RPC Classification Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(RPC_CATEGORIES).map(([id, label]) => (
              <div key={id} className="flex items-center gap-2 py-1">
                <Badge variant="outline" className="font-mono text-[10px]">{id}</Badge>
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
