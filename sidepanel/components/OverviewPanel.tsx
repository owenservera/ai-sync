import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/appStore'
import { testCapability } from '@/lib/messaging'
import { Wifi, WifiOff, RefreshCw, MessageSquare, AlertTriangle } from 'lucide-react'

interface ProviderCard {
  id: string
  name: string
  connected: boolean
  conversationCount: number
  lastSync: number | null
  isSyncing: boolean
  isRateLimited: boolean
  capabilities?: Array<{ type: string; label: string; description: string }>
}

export function OverviewPanel() {
  const { providers, setProviders, activeProvider, setActiveProvider } = useAppStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadState()
  }, [])

  async function loadState() {
    setLoading(true)
    try {
      const state: ProviderCard[] = await testCapability('GET_STATE')
      setProviders(state)
    } catch (e) {
      console.error('Failed to load state:', e)
    } finally {
      setLoading(false)
    }
  }

  async function syncProvider(providerId: string) {
    await testCapability('SYNC_PROVIDER', { providerId })
    setTimeout(loadState, 2000)
  }

  async function pingProvider(providerId: string) {
    try {
      const result = await testCapability('TEST_PING', { providerId })
      alert(`Ping ${providerId}: ${result ? 'Connected' : 'Not reachable'}`)
    } catch (e: any) {
      alert(`Ping failed: ${e.message}`)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Providers</h2>
        <Button variant="outline" size="sm" onClick={loadState} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {providers.map((p) => (
          <Card
            key={p.id}
            className={`cursor-pointer transition-colors ${p.id === activeProvider ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setActiveProvider(p.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {p.connected ? (
                    <Wifi className="w-5 h-5 text-green-500" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.connected ? `${p.conversationCount} conversations` : 'Not connected'}
                      {p.isRateLimited && (
                        <Badge variant="destructive" className="ml-2">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Rate Limited
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); pingProvider(p.id) }}>
                    Ping
                  </Button>
                  <Button variant="default" size="sm" onClick={(e) => { e.stopPropagation(); syncProvider(p.id) }} disabled={!p.connected || p.isSyncing}>
                    {p.isSyncing ? 'Syncing...' : 'Sync'}
                  </Button>
                </div>
              </div>

              {p.capabilities && p.capabilities.length > 0 && (
                <>
                  <Separator className="my-3" />
                  <div className="flex flex-wrap gap-1.5">
                    {p.capabilities.map((cap) => (
                      <Badge key={cap.type} variant="secondary" className="text-xs">
                        {cap.label}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {providers.length === 0 && !loading && (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No providers detected. Sign in to a supported service.</p>
        </div>
      )}
    </div>
  )
}
