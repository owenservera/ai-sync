import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/appStore'
import { testCapability } from '@/lib/messaging'
import { User, RefreshCw, Loader2, CheckCircle2, Mail, Hash, Database, Clock } from 'lucide-react'

interface AccountInfo {
  id: string
  serviceId: string
  index: number
  email: string
  name?: string
  conversationCount: number
  lastSync: number | null
}

export function AccountsPanel() {
  const { activeProvider, activeAccountId, setActiveAccountId } = useAppStore()
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadAccounts()
  }, [activeProvider])

  async function loadAccounts() {
    setLoading(true)
    try {
      const result = await testCapability('GET_ACCOUNTS', { serviceId: activeProvider })
      setAccounts(result || [])

      const active = await testCapability('GET_ACTIVE_ACCOUNT')
      if (active?.['settings.accounts.activeId']) {
        setActiveAccountId(active['settings.accounts.activeId'])
      }
    } catch (e) {
      console.error('Failed to load accounts:', e)
    } finally {
      setLoading(false)
    }
  }

  async function switchAccount(accountId: string) {
    setActiveAccountId(accountId)
    await testCapability('SET_ACTIVE_ACCOUNT', { accountId })
  }

  function formatTime(ts: number | null) {
    if (!ts) return 'Never'
    const date = new Date(ts)
    const diffMs = Date.now() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  function truncateId(id: string) {
    return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-6)}` : id
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Accounts</h2>
        <Button variant="outline" size="sm" onClick={loadAccounts} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{accounts.length} account(s) detected for {activeProvider}</p>

      {loading && accounts.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No accounts detected.</p>
          <p className="text-xs mt-1">Visit gemini.google.com to authenticate.</p>
        </div>
      )}

      <div className="space-y-2">
        {accounts.map((acc) => {
          const isActive = acc.id === activeAccountId || (!activeAccountId && acc.id === accounts[0]?.id)
          return (
            <Card
              key={acc.id}
              className={`cursor-pointer transition-colors ${isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              onClick={() => switchAccount(acc.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isActive && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      <p className="text-sm font-medium truncate">{acc.email || acc.name || 'Unknown'}</p>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {truncateId(acc.id)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {acc.conversationCount} conversations
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(acc.lastSync)}
                      </span>
                    </div>
                  </div>

                  {isActive && <Badge variant="default" className="shrink-0 text-[10px]">Active</Badge>}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {accounts.length > 0 && (
        <>
          <Separator className="my-4" />
          <div className="p-3 rounded-md border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              <Mail className="w-3 h-3 inline mr-1" />
              Active account: <span className="font-medium text-foreground">{accounts.find(a => a.id === activeAccountId || (!activeAccountId && a.id === accounts[0]?.id))?.email || 'None'}</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Click any account card above to switch. All tests and syncs will use the active account.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
