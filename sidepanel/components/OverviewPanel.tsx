import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/appStore'
import { executeCapability } from '@/lib/messaging'
import { registry } from '@src/capabilities/registry'
import { Wifi, WifiOff, RefreshCw, MessageSquare, AlertTriangle } from 'lucide-react'
import { AccountSelector } from './AccountSelector'

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
      const state = await executeCapability<ProviderCard[]>('gemini', 'get-state')
      console.log('GET_STATE response:', state)
      if (Array.isArray(state)) {
        setProviders(state)
      } else {
        console.error('GET_STATE returned non-array:', state)
        setProviders([])
      }
    } catch (e) {
      console.error('Failed to load state:', e)
      setProviders([])
    } finally {
      setLoading(false)
    }
  }

  async function syncProvider(providerId: string) {
    await executeCapability(providerId, 'sync-provider')
    setTimeout(loadState, 2000)
  }

  async function pingProvider(providerId: string) {
    try {
      const result = await executeCapability(providerId, 'ping')
      alert(`Ping ${providerId}: ${result ? 'Connected' : 'Not reachable'}`)
    } catch (e: any) {
      alert(`Ping failed: ${e.message}`)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <AccountSelector />
      <div className="p-4 space-y-4 flex-1 overflow-auto">
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

              {(() => {
                const supportedCaps = registry.getForProvider(p.id)
                return supportedCaps.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <div className="flex flex-wrap gap-1.5">
                      {supportedCaps.map((cap) => (
                        <Badge key={cap.id} variant="secondary" className="text-xs">
                          {cap.label}
                        </Badge>
                      ))}
                    </div>
                  </>
                )
              })()}
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
    </div>
  )
}
