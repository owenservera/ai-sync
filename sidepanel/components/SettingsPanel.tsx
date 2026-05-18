import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useSettingsStore, type SyncMode } from '@/stores/settingsStore'
import { testCapability } from '@/lib/messaging'
import { useState } from 'react'
import { Save, Shield, RefreshCw, Clock, Zap, Hand } from 'lucide-react'
import { AccountSelector } from './AccountSelector'

const SYNC_MODES: { value: SyncMode; label: string; description: string; icon: typeof Zap }[] = [
  { value: 'sync-all', label: 'Sync All', description: 'Download all conversations (up to 500)', icon: RefreshCw },
  { value: 'sync-latest', label: 'Sync Latest', description: 'Only sync the most recent N conversations', icon: Clock },
  { value: 'auto-sync', label: 'Auto Sync', description: 'Sync automatically on network activity', icon: Zap },
  { value: 'manual-only', label: 'Manual Only', description: 'Disable all automatic syncing', icon: Hand },
]

export function SettingsPanel() {
  const {
    manualSync, setManualSync,
    syncMode, setSyncMode,
    syncLastN, setSyncLastN,
    summaryOrgId, setSummaryOrgId,
    batchSize, setBatchSize,
    maxLimit, setMaxLimit,
    maxPages, setMaxPages,
    rateLimitWindowMs, setRateLimitWindowMs,
    rateLimitMaxRequests, setRateLimitMaxRequests,
    rateLimitMinGapMs, setRateLimitMinGapMs,
    rateLimitAutoResetMs, setRateLimitAutoResetMs,
    saveSettings,
  } = useSettingsStore()

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    await saveSettings()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function checkRateLimit() {
    try {
      const result = await testCapability<any>('GET_RATE_LIMIT_STATUS')
      alert(`Rate limited: ${result?.isRateLimited ?? 'unknown'}`)
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <AccountSelector />
      <div className="p-4 space-y-4 flex-1 overflow-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Settings</h2>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Sync Mode</CardTitle>
          <CardDescription>How conversations are synchronized</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {SYNC_MODES.map((mode) => {
            const Icon = mode.icon
            return (
              <button
                key={mode.value}
                onClick={() => setSyncMode(mode.value)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  syncMode === mode.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className={`p-2 rounded-md ${syncMode === mode.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{mode.label}</div>
                  <div className="text-xs text-muted-foreground">{mode.description}</div>
                </div>
                {syncMode === mode.value && (
                  <Badge variant="default" className="text-[10px]">Active</Badge>
                )}
              </button>
            )
          })}

          {syncMode === 'sync-latest' && (
            <div className="mt-3 pt-3 border-t border-border">
              <Label className="text-xs">Sync Last N Conversations</Label>
              <Input
                type="number"
                value={syncLastN}
                onChange={(e) => setSyncLastN(parseInt(e.target.value) || 10)}
                className="mt-1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">General</CardTitle>
          <CardDescription>Core sync and behavior settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Manual Sync Mode</Label>
              <p className="text-xs text-muted-foreground">Disable auto-sync on network activity</p>
            </div>
            <Switch checked={manualSync} onCheckedChange={setManualSync} />
          </div>
          <Separator />
          <div>
            <Label>Summary Org ID</Label>
            <Input placeholder="Organization ID for summarization" value={summaryOrgId} onChange={(e) => setSummaryOrgId(e.target.value)} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pagination</CardTitle>
          <CardDescription>Conversation listing parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Batch Size</Label>
              <Input type="number" value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Max Limit</Label>
              <Input type="number" value={maxLimit} onChange={(e) => setMaxLimit(parseInt(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Max Pages</Label>
              <Input type="number" value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value))} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rate Limiting</CardTitle>
          <CardDescription>Request throttling and recovery</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Window (ms)</Label>
              <Input type="number" value={rateLimitWindowMs} onChange={(e) => setRateLimitWindowMs(parseInt(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Max Requests</Label>
              <Input type="number" value={rateLimitMaxRequests} onChange={(e) => setRateLimitMaxRequests(parseInt(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Min Gap (ms)</Label>
              <Input type="number" value={rateLimitMinGapMs} onChange={(e) => setRateLimitMinGapMs(parseInt(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Auto Reset (ms)</Label>
              <Input type="number" value={rateLimitAutoResetMs} onChange={(e) => setRateLimitAutoResetMs(parseInt(e.target.value))} className="mt-1" />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={checkRateLimit}>
            <Shield className="w-4 h-4 mr-1" />
            Check Rate Limit Status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">RPC ID Reference</CardTitle>
          <CardDescription>Known Gemini batchexecute RPC IDs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 text-xs font-mono">
            {[
              ['MaZiqc', 'List/paginate conversations'],
              ['hNvQHb', 'Fetch messages'],
              ['MUAZcd', 'Edit title'],
              ['GzXR5e', 'Delete conversation'],
              ['PCck7e', 'Summarize / stream'],
              ['qWymEb', 'Unknown modify'],
              ['CNgdBe', 'List Gem definitions'],
              ['HcT8bb', 'Unknown modify'],
              ['unqWSc', 'Search conversations'],
              ['o30O0e', 'Profile / account info'],
            ].map(([id, fn]) => (
              <div key={id} className="flex items-center gap-2 py-1 border-b border-border/50">
                <Badge variant="outline" className="font-mono text-[10px]">{id}</Badge>
                <span className="text-muted-foreground">{fn}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
