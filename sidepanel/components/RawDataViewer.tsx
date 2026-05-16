import { useState } from 'react'
import { ChevronRight, ChevronDown, Image, FileCode, Link, Database } from 'lucide-react'
import { extractMediaFromRaw } from '@/lib/media-extract'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function getTypeBadge(value: any): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `array[${value.length}]`
  if (typeof value === 'object') return `object{${Object.keys(value).length}}`
  return typeof value
}

function isUrl(value: string): boolean {
  return /^https?:\/\//.test(value)
}

function isBase64(value: string): boolean {
  return /^data:[a-z0-9/+_-]+;base64,/i.test(value)
}

function isImageData(value: string): boolean {
  return /^data:image\//i.test(value) || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(value)
}

function truncate(str: string, maxLen: number): { text: string; truncated: boolean } {
  if (str.length <= maxLen) return { text: str, truncated: false }
  return { text: str.slice(0, maxLen) + '…', truncated: true }
}

function TreeValue({ value, depth = 0 }: { value: any; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [showMore, setShowMore] = useState(false)

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">[]</span>
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span className="text-muted-foreground">Array[{value.length}]</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border pl-2 mt-1 space-y-1">
            {value.map((item, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground text-xs w-6 shrink-0">{i}:</span>
                <TreeValue value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return <span className="text-muted-foreground">{"{}"}</span>
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span className="text-muted-foreground">Object{"{"}{keys.length}{"}"}</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border pl-2 mt-1 space-y-1">
            {keys.map((key) => (
              <div key={key} className="flex gap-2">
                <span className="text-foreground text-xs font-medium shrink-0">{key}:</span>
                <TreeValue value={value[key]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (typeof value === 'string') {
    const isUrlVal = isUrl(value)
    const isBase64Val = isBase64(value)
    const isImageVal = isImageData(value)
    const { text, truncated } = truncate(value, 200)

    let colorClass = 'text-foreground'
    if (isUrlVal) colorClass = 'text-blue-500'
    else if (isBase64Val) colorClass = 'text-purple-500'
    else if (isImageVal) colorClass = 'text-green-500'

    return (
      <div>
        <span className={`text-xs font-mono break-all ${colorClass}`}>{text}</span>
        {truncated && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-xs text-muted-foreground hover:text-foreground ml-1"
          >
            {showMore ? 'Show less' : 'Show more'}
          </button>
        )}
        {showMore && truncated && (
          <div className={`text-xs font-mono break-all mt-1 ${colorClass}`}>{value}</div>
        )}
      </div>
    )
  }

  if (typeof value === 'boolean') {
    return <span className="text-yellow-500 text-xs">{String(value)}</span>
  }

  return <span className="text-cyan-500 text-xs">{String(value)}</span>
}

function MediaSummary({ raw }: { raw: any }) {
  const media = extractMediaFromRaw(raw)

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Database className="w-4 h-4" />
          Media Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 text-xs">
            <Image className="w-3 h-3 text-green-500" />
            <span>Images: {media.images.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <FileCode className="w-3 h-3 text-orange-500" />
            <span>Files: {media.files.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link className="w-3 h-3 text-blue-500" />
            <span>Links: {media.links.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Database className="w-3 h-3 text-purple-500" />
            <span>Code Blocks: {media.codeBlocks.length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function countNodes(raw: any): { total: number; strings: number; urls: number; images: number } {
  const counts = { total: 0, strings: 0, urls: 0, images: 0 }

  function scan(value: any) {
    counts.total++
    if (typeof value === 'string') {
      counts.strings++
      if (/^https?:\/\//.test(value)) counts.urls++
      if (/^data:image\//i.test(value) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value)) counts.images++
    }
    if (Array.isArray(value)) value.forEach(scan)
    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) scan(v)
    }
  }

  scan(raw)
  return counts
}

export function RawDataViewer({ raw }: { raw: any }) {
  const counts = countNodes(raw)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">Nodes: {counts.total}</Badge>
        <Badge variant="secondary">Strings: {counts.strings}</Badge>
        <Badge variant="secondary">URLs: {counts.urls}</Badge>
        <Badge variant="secondary">Images: {counts.images}</Badge>
      </div>
      <MediaSummary raw={raw} />
      <div className="rounded-md border bg-muted/30 p-3 max-h-96 overflow-auto">
        <TreeValue value={raw} />
      </div>
    </div>
  )
}
