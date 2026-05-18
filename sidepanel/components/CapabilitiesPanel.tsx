import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAccount } from '@/contexts/AccountContext'
import { useAppStore } from '@/stores/appStore'
import { executeCapability } from '@/lib/messaging'
import { registry } from '@src/capabilities/registry'
import type { CapabilityDefinition } from '@src/capabilities/types'
import { Loader2, Play, CheckCircle2, XCircle, Clock, ExternalLink, Search, RefreshCw, Trash2, Edit3, Plus, FileText, Sparkles, Database, WifiOff, Image, Download, Send, Eye, Navigation, FileInput, FileOutput, Palette, Activity, UserCheck, User, Settings, TestTube, List, Cpu, Layout, Repeat, Network, AlertTriangle } from 'lucide-react'
import { MediaGallery } from './MediaGallery'
import { AccountSelector } from './AccountSelector'

import { deobfuscateRawResponse } from '@/lib/raw-api-taxonomy'
import { runProtocolTests, type TestSuiteResult } from '@/lib/protocol-test-suite'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Database, FileText, Edit3, Trash2, Plus, Search, CheckCircle2, ExternalLink,
  Sparkles, RefreshCw, WifiOff, Image, Download, Send, Eye, Navigation,
  FileInput, FileOutput, Palette, Activity, UserCheck, User, Settings,
  TestTube, List, Cpu, Layout, Repeat, Network, AlertTriangle,
}

const CAPABILITY_CARDS = registry.getAll()
  .filter(cap => cap.category !== 'bridge')
  .map(cap => ({
    ...cap,
    Icon: iconMap[cap.icon || 'Database'] || Database,
  }))

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

async function downloadMediaFile(url: string, filename: string) {
  try {
    const results = await chrome.runtime.sendMessage({ type: 'FETCH_MEDIA_AS_BASE64', urls: [url] })
    const result = results?.[0]
    if (result?.error || !result?.dataUrl) {
      window.open(url, '_blank')
      return
    }
    const a = document.createElement('a')
    a.href = result.dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {
    window.open(url, '_blank')
  }
}

async function downloadMediaFilesBatch(urls: string[], getFilename: (url: string, idx: number) => string) {
  const batchSize = 5
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize)
    try {
      const results = await chrome.runtime.sendMessage({ type: 'FETCH_MEDIA_AS_BASE64', urls: batch })
      for (let j = 0; j < results?.length; j++) {
        const result = results[j]
        if (result?.dataUrl) {
          const a = document.createElement('a')
          a.href = result.dataUrl
          a.download = getFilename(batch[j], i + j)
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      }
    } catch {
      for (let j = 0; j < batch.length; j++) {
        window.open(batch[j], '_blank')
      }
    }
    if (i + batchSize < urls.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }
}

function nameRawMessage(msg: any): any {
  if (!Array.isArray(msg) || msg.length < 5) return { raw: msg }
  const [idPair, parentInfo, content, response, timestamp] = msg

  const userContent = content?.[0]?.[0] ?? null

  const primaryBlock = response?.[0] ?? []
  const respData = primaryBlock?.[0] ?? null
  const responseId = respData?.[0] ?? null
  const responseText = respData?.[1]?.[0] ?? null
  const responseParts = respData?.[1]?.slice(1) ?? []
  const promptPreview = respData?.[2] ?? null
  const promptFull = respData?.[3] ?? null

  const toolCalls = primaryBlock?.[1] ?? []
  const namedToolCalls = toolCalls.map((tc: any) => ({
    toolId: tc?.[0] ?? null,
    toolName: tc?.[1]?.[0] ?? null,
    toolStatus: tc?.[1]?.[1] ?? null,
    statusMessage: tc?.[1]?.[2] ?? null,
    statusDetail: tc?.[1]?.[3] ?? null,
    toolState: tc?.[2] ?? null,
    toolResult: tc?.[3] ?? null,
  }))

  const toolStates = response?.[1] ?? []
  const toolResults = response?.[2] ?? null

  const locale = primaryBlock?.[5] ?? response?.[8] ?? null
  const isComplete = primaryBlock?.[6] ?? response?.[9] ?? null
  const isStreaming = primaryBlock?.[7] ?? response?.[10] ?? null
  const usageStats = primaryBlock?.[12] ?? null
  const conversationHash1 = primaryBlock?.[13] ?? response?.[14] ?? null
  const conversationHash2 = primaryBlock?.[15] ?? response?.[17] ?? null
  const modelName = primaryBlock?.[19] ?? response?.[21] ?? null
  const modelVersion = primaryBlock?.[22] ?? response?.[24] ?? null

  return {
    messageId: idPair?.[1] ?? null,
    conversationId: idPair?.[0] ?? null,
    parentId: parentInfo?.[1] ?? null,
    timestamp: timestamp?.[0] ?? null,
    timestampNanos: timestamp?.[1] ?? null,
    user: {
      content: userContent,
    },
    assistant: {
      responseId,
      text: responseText,
      parts: responseParts,
      promptPreview,
      promptFull,
    },
    tools: {
      calls: namedToolCalls,
      states: toolStates,
      results: toolResults,
    },
    metadata: {
      locale,
      isComplete,
      isStreaming,
      usageStats,
      conversationHash1,
      conversationHash2,
      modelName,
      modelVersion,
      raw: response?.slice(25) ?? [],
    },
  }
}

function nameImageMetadata(img: any): any {
  if (!img || !Array.isArray(img)) return { raw: img }
  return {
    unknown1: img[0] ?? null,
    index: img[1] ?? null,
    filename: img[2] ?? null,
    thumbnailUrl: img[3] ?? null,
    unknown2: img[4] ?? null,
    base64Data: img[5] ? '(base64 data present)' : null,
    unknown3: img[6] ?? null,
    unknown4: img[7] ?? null,
    unknown5: img[8] ?? null,
    createdTimestamp: img[9]?.[0] ?? null,
    createdTimestampNanos: img[9]?.[1] ?? null,
    unknown6: img[10] ?? null,
    mimeType: img[11] ?? null,
    unknown7: img[12] ?? null,
    unknown8: img[13] ?? null,
    unknown9: img[14] ?? null,
    dimensions: {
      width: img[15]?.[0] ?? null,
      height: img[15]?.[1] ?? null,
      fileSize: img[15]?.[2] ?? null,
    },
  }
}

function nameVideoMetadata(video: any): any {
  if (!video || !Array.isArray(video)) return { raw: video }
  return {
    unknown1: video[0] ?? null,
    index: video[1] ?? null,
    filename: video[2] ?? null,
    thumbnailUrl: video[3] ?? null,
    unknown2: video[4] ?? null,
    base64Data: video[5] ? '(base64 data present)' : null,
    unknown3: video[6] ?? null,
    downloadUrls: video[7] ?? null,
    unknown4: video[8] ?? null,
    createdTimestamp: video[9]?.[0] ?? null,
    createdTimestampNanos: video[9]?.[1] ?? null,
    unknown5: video[10] ?? null,
    mimeType: video[11] ?? null,
    unknown6: video[12] ?? null,
    unknown7: video[13] ?? null,
    unknown8: video[14] ?? null,
    unknown9: video[15] ?? null,
    videoInfo: {
      duration: video[16]?.[0] ?? null,
      durationNanos: video[16]?.[1] ?? null,
      width: video[16]?.[1] ?? null,
      height: video[16]?.[2] ?? null,
    },
  }
}

function nameSafetyClassifier(classifier: any): any {
  if (!classifier || !Array.isArray(classifier)) return { raw: classifier }
  return {
    classifierName: classifier[0] ?? null,
    results: (classifier[1] ?? []).map((r: any) => ({
      label: r?.[0] ?? null,
      unknown: r?.[1] ?? null,
      score: r?.[2] ?? null,
    })),
    resultType: classifier[2] ?? null,
    numericId: classifier[3] ?? null,
  }
}

function nameResponseConfig(config: any): any {
  if (!config || !Array.isArray(config)) return { raw: config }
  return {
    imageMetadata: config[0] ? nameImageMetadata(config[0]) : null,
    videoMetadata: config[0] ? nameVideoMetadata(config[0]) : null,
    promptUrl: config[1]?.[0] ?? null,
    unknown1: config[1]?.[1] ?? null,
    promptText: config[1]?.[2] ?? null,
    unknown2: config[2] ?? null,
    settings: {
      model: config[3]?.[0] ?? null,
      promptText: config[3]?.[1] ?? null,
      unknown3: config[3]?.slice(2, 15) ?? null,
      safetyFilter: config[3]?.[15] ?? null,
      unknown4: config[3]?.[16] ?? null,
      complaintFlow: config[3]?.[17] ?? null,
    },
  }
}

function nameRawApiResponse(raw: any): any {
  if (!raw || typeof raw !== 'object') return { raw }
  if (raw.error) return raw

  const messages = Array.isArray(raw?.[0]) ? raw[0].map(nameRawMessage) : []
  const cursor = raw?.[1] ?? null
  const responseMeta = raw?.[2] ?? null

  let namedResponseMeta = null
  if (responseMeta && Array.isArray(responseMeta)) {
    const configs = responseMeta[0]?.[0]?.[0]?.[0] ?? []
    namedResponseMeta = {
      configs: configs.map(nameResponseConfig),
      raw: responseMeta,
    }
  }

  return {
    messages,
    pagination: {
      nextCursor: cursor,
    },
    responseMetadata: namedResponseMeta,
  }
}

function CapabilityCard({ cap }: { cap: typeof CAPABILITY_CARDS[0] }) {
  const { activeAccount } = useAccount()
  const { activeProvider } = useAppStore()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  const Icon = cap.Icon

  function updateField(field: string, value: string) {
    setFormValues((prev) => ({ ...prev, [field]: value }))
  }

  async function runTest() {
    setStatus('loading')
    setResult(null)
    setError(null)

    try {
      const payload: Record<string, unknown> = { ...formValues }

      for (const param of cap.params) {
        if (param.type === 'number' && payload[param.name]) {
          payload[param.name] = Number(payload[param.name])
        }
        if (param.type === 'boolean' && payload[param.name] !== undefined) {
          payload[param.name] = payload[param.name] === 'true' || payload[param.name] === true
        }
        if (param.type === 'array' && typeof payload[param.name] === 'string') {
          try { payload[param.name] = JSON.parse(payload[param.name] as string) } catch {}
        }
      }

      if (cap.id === 'protocol-test-suite') {
        const suiteResult = await runProtocolTests({ providerId: activeProvider, accountId: activeAccount?.id || undefined })
        setResult(suiteResult)
        setStatus('success')
        return
      }

      const data = await executeCapability(activeProvider, cap.id, activeAccount?.id || undefined, payload)
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
          {cap.params?.map(param => (
            <div key={param.name}>
              <Label className="text-xs">{param.name} {param.required ? '*' : ''}</Label>
              {param.type === 'number' ? (
                <Input type="number" placeholder={param.description} value={formValues[param.name] || ''} onChange={(e) => updateField(param.name, e.target.value)} />
              ) : param.type === 'array' || param.name === 'prompt' || param.name === 'systemPrompt' || param.name === 'query' || param.name === 'searchResults' ? (
                <Textarea placeholder={param.description} value={formValues[param.name] || ''} onChange={(e) => updateField(param.name, e.target.value)} />
              ) : (
                <Input placeholder={param.description} value={formValues[param.name] || ''} onChange={(e) => updateField(param.name, e.target.value)} />
              )}
            </div>
          ))}
        </div>

        {status === 'success' && cap.id === 'download-media' && result?.media && (
          <MediaGallery media={result.media} />
        )}
        {status === 'success' && cap.id === 'download-raw' && result?.conversations && (
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
                      <Button size="sm" variant="outline" onClick={() => exportJson(nameRawApiResponse(conv.rawApiResponse), `raw_${conv.header?.id}`)} title="Raw API (named fields)">
                        <Download className="w-3 h-3" />
                      </Button>
                    )}
                    {conv.parsedMessages && (
                      <Button size="sm" variant="outline" onClick={() => exportJson(conv.parsedMessages, `parsed_${conv.header?.id}`)} title="Parsed messages">
                        <Download className="w-3 h-3" />
                      </Button>
                    )}
                    {conv.media && conv.media.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => conv.media.forEach((m: any, idx: number) => downloadMediaFile(m.url, `media_${conv.header?.id}_${idx + 1}.${m.url.split('.').pop()?.split('?')[0] || 'png'}`))} title="Download media files">
                        <Download className="w-3 h-3" />
                      </Button>
                    )}
                    {conv.media && conv.media.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => exportJson(conv.parsedMessages?.filter((m: any) => m.media?.length).map((m: any) => ({ text: m.text, media: m.media })) || [], `parsed_media_${conv.header?.id}`)} title="Parsed media metadata">
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
              <Button size="sm" variant="outline" onClick={() => exportJson(result.conversations.map((c: any) => nameRawApiResponse(c.rawApiResponse)).filter(Boolean), `raw_all_${Date.now()}`)}>
                <Download className="w-3 h-3 mr-1" /> Export All Raw
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportJson(result.conversations.map((c: any) => ({ id: c.header?.id, title: c.header?.title, messages: c.parsedMessages, media: c.media })).filter((c: any) => c.messages?.length), `parsed_all_${Date.now()}`)}>
                <Download className="w-3 h-3 mr-1" /> Export All Parsed
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                const allMedia = result.conversations.flatMap((c: any) => (c.media || []).map((m: any) => ({ url: m.url, conversationId: c.header?.id })))
                downloadMediaFilesBatch(
                  allMedia.map((m: any) => m.url),
                  (url, idx) => `media_${allMedia[idx].conversationId}_${idx + 1}.${url.split('.').pop()?.split('?')[0] || 'png'}`
                )
              }}>
                <Download className="w-3 h-3 mr-1" /> Download All Media
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportJson(result.conversations.flatMap((c: any) => (c.parsedMessages || []).filter((m: any) => m.media?.length).map((m: any) => ({ text: m.text, media: m.media, conversationId: c.header?.id, conversationTitle: c.header?.title }))), `parsed_media_all_${Date.now()}`)}>
                <Download className="w-3 h-3 mr-1" /> Export All Parsed Media
              </Button>
            </div>
          </>
        )}
        {status === 'success' && cap.id === 'deobfuscate' && result?.conversations && (
          <>
            {result.conversations.map((conv: any, i: number) => {
              if (conv.error || !conv.rawApiResponse) return null
              const analysis = deobfuscateRawResponse(conv.rawApiResponse)
              return (
                <div key={i} className="mt-3 p-3 rounded-md border">
                  <h4 className="text-sm font-medium mb-2 truncate">{conv.header?.title || conv.header?.id || 'Error'}</h4>
                  <div className="flex flex-wrap gap-2 text-xs mb-3">
                    <Badge variant="secondary">{analysis.confirmed.length} confirmed fields</Badge>
                    <Badge variant="secondary">{analysis.unknowns.length} unknown fields</Badge>
                    <Badge variant="secondary">{Object.keys(analysis.taxonomy).length} total mapped</Badge>
                  </div>
                  {analysis.confirmed.length > 0 && (
                    <details className="text-xs mb-2" open>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Confirmed Fields ({analysis.confirmed.length})</summary>
                      <pre className="mt-1 p-2 rounded bg-muted/50 overflow-auto max-h-64 text-[10px] whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(analysis.confirmed, null, 2)}
                      </pre>
                    </details>
                  )}
                  {analysis.unknowns.length > 0 && (
                    <details className="text-xs mb-2">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Unknown Fields ({analysis.unknowns.length})</summary>
                      <pre className="mt-1 p-2 rounded bg-muted/50 overflow-auto max-h-64 text-[10px] whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(analysis.unknowns, null, 2)}
                      </pre>
                    </details>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Full Taxonomy ({Object.keys(analysis.taxonomy).length})</summary>
                    <pre className="mt-1 p-2 rounded bg-muted/50 overflow-auto max-h-96 text-[10px] whitespace-pre-wrap break-all font-mono">
                      {JSON.stringify(analysis.taxonomy, null, 2)}
                    </pre>
                  </details>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => exportJson(analysis, `deobfuscate_${conv.header?.id}_${Date.now()}`)}>
                      <Download className="w-3 h-3 mr-1" /> Export Analysis
                    </Button>
                  </div>
                </div>
              )
            })}
          </>
        )}
        {status === 'success' && cap.id === 'protocol-test-suite' && result && (() => {
          const suite = result as TestSuiteResult
          return (
            <>
              <div className="flex flex-wrap gap-2 mt-3 text-xs">
                <Badge variant="secondary">{suite.passed}/{suite.total} passed</Badge>
                {suite.failed > 0 && <Badge variant="destructive">{suite.failed} failed</Badge>}
                {suite.skipped > 0 && <Badge variant="secondary">{suite.skipped} skipped</Badge>}
                <Badge variant="secondary">{(suite.duration / 1000).toFixed(1)}s</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {suite.tests.map((test, i) => (
                  <div key={i} className="p-3 rounded-md border text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{test.name}</span>
                      <Badge variant={test.status === 'pass' ? 'success' : test.status === 'fail' ? 'destructive' : 'secondary'}>
                        {test.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{test.details}</p>
                    {test.error && <p className="text-destructive mt-1">{test.error}</p>}
                    <span className="text-muted-foreground">{test.duration}ms</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => exportJson(result, `protocol_test_${Date.now()}`)}>
                  <Download className="w-3 h-3 mr-1" /> Export Results
                </Button>
              </div>
            </>
          )
        })()}
        {status === 'success' && cap.id !== 'download-raw' && cap.id !== 'deobfuscate' && cap.id !== 'protocol-test-suite' && <ResultDisplay result={result} />}
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
    <div className="flex flex-col h-full">
      <AccountSelector />
      <div className="p-4 space-y-3 flex-1 overflow-auto">
        <h2 className="text-base font-semibold mb-3">Capability Tests</h2>
        <div className="grid grid-cols-1 gap-3">
          {CAPABILITY_CARDS.map((cap) => (
            <CapabilityCard key={cap.id} cap={cap} />
          ))}
        </div>
      </div>
    </div>
  )
}
