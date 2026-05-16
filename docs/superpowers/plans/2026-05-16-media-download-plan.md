# Media Download Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract and display media (images, files, generated images, code blocks) from Gemini conversations with download capability.

**Architecture:** Service worker fetches conversation, extracts media URLs via pattern matching in `media-extract.ts`, returns structured media objects to sidepanel for display in `MediaGallery.tsx`. Download triggers via `chrome.downloads.download()`.

**Tech Stack:** TypeScript, React 19, lucide-react, shadcn/ui components, Chrome Extension APIs

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `sidepanel/lib/media-extract.ts` | Create | MediaItem type, extractMediaFromMessages, extractMediaFromRaw functions |
| `sidepanel/components/MediaGallery.tsx` | Create | Display component for extracted media with grid/list layouts |
| `background/service_worker.ts` | Modify | Add TEST_DOWNLOAD_MEDIA message handler |
| `sidepanel/components/CapabilitiesPanel.tsx` | Modify | Add media test card to capabilities list |

---

### Task 1: Media Extraction Library

**Files:**
- Create: `sidepanel/lib/media-extract.ts`

- [ ] **Step 1: Create media-extract.ts with types and extraction functions**

```typescript
export interface MediaItem {
  type: 'Generated Image' | 'Image' | 'File' | 'Code Block'
  url: string
  thumbnail?: string
  name?: string
}

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i
const GOOGLE_MEDIA_HOSTS = /(?:googleusercontent\.com|ggpht\.com|googleapis\.com)/i
const DATA_URI_PATTERN = /^data:image\/[^;]+;base64,/i
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const HTML_IMG_PATTERN = /<img[^>]+src=["']([^"']+)["']/gi

function classifyMediaUrl(url: string, context?: string): MediaItem['type'] {
  if (context && /generated|generation/i.test(context)) {
    return 'Generated Image'
  }
  if (context && /code|snippet|```/i.test(context)) {
    return 'Code Block'
  }
  if (IMAGE_EXTENSIONS.test(url) || DATA_URI_PATTERN.test(url) || GOOGLE_MEDIA_HOSTS.test(url)) {
    return 'Image'
  }
  return 'File'
}

export function extractMediaFromMessages(messages: any[]): MediaItem[] {
  const media: MediaItem[] = []
  const seen = new Set<string>()

  for (const msg of messages) {
    const content = msg?.content || ''
    if (typeof content !== 'string') continue

    // Markdown images
    for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
      const url = match[2]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url, name: match[1] || undefined })
      }
    }

    // HTML img tags
    for (const match of content.matchAll(HTML_IMG_PATTERN)) {
      const url = match[1]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url })
      }
    }

    // Direct URLs with image extensions
    const urlPattern = /https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp|svg)(\?[^\s"'<>]*)?/gi
    for (const match of content.matchAll(urlPattern)) {
      const url = match[0]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url })
      }
    }

    // Google-hosted media URLs
    const googlePattern = /https?:\/\/[^\s"'<>]*(?:googleusercontent\.com|ggpht\.com)[^\s"'<>]*/gi
    for (const match of content.matchAll(googlePattern)) {
      const url = match[0]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url })
      }
    }

    // Data URIs
    const dataUriPattern = /data:image\/[^;]+;base64,[^\s"'<>]+/gi
    for (const match of content.matchAll(dataUriPattern)) {
      const url = match[0]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: 'Image', url, name: 'Embedded Image' })
      }
    }
  }

  return media
}

function scanObjectForUrls(obj: any, context: string = '', media: MediaItem[], seen: Set<string>) {
  if (!obj) return
  if (typeof obj === 'string') {
    if (obj.startsWith('http') || obj.startsWith('data:')) {
      if (!seen.has(obj)) {
        seen.add(obj)
        media.push({ type: classifyMediaUrl(obj, context), url: obj })
      }
    }
    return
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      scanObjectForUrls(item, context, media, seen)
    }
    return
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const urlKeys = ['url', 'imageUrl', 'attachmentUrl', 'thumbnailUrl', 'src', 'href']
      const newContext = urlKeys.includes(key) ? `${context} ${key}` : context
      scanObjectForUrls(value, newContext, media, seen)
    }
  }
}

export function extractMediaFromRaw(raw: any[]): MediaItem[] {
  const media: MediaItem[] = []
  const seen = new Set<string>()
  scanObjectForUrls(raw, '', media, seen)
  return media
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit sidepanel/lib/media-extract.ts` (or check with LSP diagnostics)
Expected: No errors

---

### Task 2: MediaGallery Component

**Files:**
- Create: `sidepanel/components/MediaGallery.tsx`

- [ ] **Step 1: Create MediaGallery component**

```typescript
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Image, FileText, Download, Code, X } from 'lucide-react'
import type { MediaItem } from '@/lib/media-extract'

interface MediaGalleryProps {
  media: MediaItem[]
}

const typeIcons: Record<string, any> = {
  'Generated Image': Image,
  'Image': Image,
  'File': FileText,
  'Code Block': Code,
}

const typeVariants: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  'Generated Image': 'success',
  'Image': 'default',
  'File': 'secondary',
  'Code Block': 'warning',
}

function getImageUrl(item: MediaItem): string {
  return item.thumbnail || item.url
}

function isImageType(type: string): boolean {
  return type === 'Image' || type === 'Generated Image'
}

export function MediaGallery({ media }: MediaGalleryProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  if (media.length === 0) {
    return (
      <div className="mt-3 p-4 rounded-md border text-center text-sm text-muted-foreground">
        No media found in this conversation
      </div>
    )
  }

  const images = media.filter(m => isImageType(m.type))
  const files = media.filter(m => !isImageType(m.type))

  function handleDownload(item: MediaItem) {
    chrome.downloads.download({ url: item.url, filename: item.name || item.url.split('/').pop() || 'download' })
  }

  return (
    <div className="mt-3 space-y-4">
      {images.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Images ({images.length})</h4>
          <div className="grid grid-cols-3 gap-2">
            {images.map((item, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-md overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setExpandedImage(getImageUrl(item))}
              >
                <img src={getImageUrl(item)} alt={item.name || ''} className="w-full h-full object-cover" />
                <Badge
                  variant={typeVariants[item.type] || 'secondary'}
                  className="absolute top-1 left-1 text-[10px]"
                >
                  {item.type}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Files ({files.length})</h4>
          <div className="space-y-2">
            {files.map((item, i) => {
              const Icon = typeIcons[item.type] || FileText
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md border">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{item.name || item.url.split('/').pop() || item.url}</span>
                  <Badge variant={typeVariants[item.type] || 'secondary'} className="shrink-0">
                    {item.type}
                  </Badge>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => handleDownload(item)}>
                    <Download className="w-3 h-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img src={expandedImage} alt="" className="max-w-full max-h-[90vh] object-contain" />
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 right-2"
              onClick={() => setExpandedImage(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify component compiles**

Check with LSP diagnostics on `sidepanel/components/MediaGallery.tsx`
Expected: No errors

---

### Task 3: Service Worker Media Handler

**Files:**
- Modify: `background/service_worker.ts`

- [ ] **Step 1: Add TEST_DOWNLOAD_MEDIA to message handler switch**

In `background/service_worker.ts`, add `TEST_DOWNLOAD_MEDIA` to the existing switch block at line ~187:

```typescript
    case 'TEST_DOWNLOAD_MEDIA':
    case 'GET_RATE_LIMIT_STATUS': {
```

- [ ] **Step 2: Add TEST_DOWNLOAD_MEDIA case in handleCapabilityTest**

Add this case before the `default` throw in `handleCapabilityTest`:

```typescript
    case 'TEST_DOWNLOAD_MEDIA': {
      const conversation = await provider.getConversation(account, message.conversationId)
      if (!conversation) throw new Error('Conversation not found')

      const { extractMediaFromMessages, extractMediaFromRaw } = await import('../sidepanel/lib/media-extract')

      const messages = conversation.messages || []
      const mediaFromMessages = extractMediaFromMessages(messages)

      const raw = (conversation as any).raw || []
      const mediaFromRaw = extractMediaFromRaw(raw)

      const allMedia = [...mediaFromMessages, ...mediaFromRaw]
      const seen = new Set<string>()
      const uniqueMedia = allMedia.filter(m => {
        if (seen.has(m.url)) return false
        seen.add(m.url)
        return true
      })

      return { conversationId: conversation.id, media: uniqueMedia }
    }
```

- [ ] **Step 3: Verify service worker compiles**

Check with LSP diagnostics on `background/service_worker.ts`
Expected: No errors

---

### Task 4: CapabilitiesPanel Media Test Card

**Files:**
- Modify: `sidepanel/components/CapabilitiesPanel.tsx`

- [ ] **Step 1: Add Image import and media capability to CAPABILITIES array**

Add `Image` to the lucide-react imports at line 11:

```typescript
import { Loader2, Play, CheckCircle2, XCircle, Clock, ExternalLink, Search, RefreshCw, Trash2, Edit3, Plus, FileText, Sparkles, Database, WifiOff, Image } from 'lucide-react'
```

Add media capability to CAPABILITIES array (after the existing entries):

```typescript
  { id: 'media', type: 'TEST_DOWNLOAD_MEDIA', label: 'Download Media', icon: Image, description: 'Extract and download all media from a conversation' },
```

- [ ] **Step 2: Add media form field in CapabilityCard**

Add this condition inside the form fields section (after the offline check block, around line 169):

```typescript
          {cap.id === 'media' && (
            <div>
              <Label className="text-xs">Conversation ID</Label>
              <Input placeholder="c_xxx or xxx" value={formValues.conversationId || ''} onChange={(e) => updateField('conversationId', e.target.value)} />
            </div>
          )}
```

- [ ] **Step 3: Add conversationId payload for media capability**

Add `'media'` to the existing conversationId condition at line 63:

```typescript
      if (cap.id === 'fetch' || cap.id === 'edit' || cap.id === 'delete' || cap.id === 'url' || cap.id === 'media') {
```

- [ ] **Step 4: Render MediaGallery on success for media capability**

Add import at top of file:

```typescript
import { MediaGallery } from './MediaGallery'
```

Replace the `ResultDisplay` usage for media capability. After the existing `{status === 'success' && <ResultDisplay result={result} />}` line, add:

```typescript
        {status === 'success' && cap.id === 'media' && result?.media && (
          <MediaGallery media={result.media} />
        )}
        {status === 'success' && (cap.id !== 'media' || !result?.media) && <ResultDisplay result={result} />}
```

- [ ] **Step 5: Verify CapabilitiesPanel compiles**

Check with LSP diagnostics on `sidepanel/components/CapabilitiesPanel.tsx`
Expected: No errors

---

### Task 5: Build and Verify

- [ ] **Step 1: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Check for TypeScript errors across all modified files**

Run: `npx tsc --noEmit`
Expected: No errors

---

## Self-Review

**Spec coverage check:**
- MediaGallery.tsx with grid/list layouts, type badges, lucide icons — Task 2
- TEST_DOWNLOAD_MEDIA handler in service_worker.ts — Task 3
- Media test card in CapabilitiesPanel — Task 4
- media-extract.ts with extractMediaFromMessages and extractMediaFromRaw — Task 1
- All patterns (markdown, HTML, direct URLs, data URIs, Google hosts) — Task 1
- Type classification (Generated Image, Image, File, Code Block) — Task 1
- Keep all existing comments — no comments removed
- Use existing shadcn components — Tasks 2, 4 use Card, Badge, Button
- Self-contained components — MediaGallery accepts props only
- Match existing code patterns — follows CapabilitiesPanel patterns

**Placeholder scan:** No TBDs, TODOs, or vague instructions found.

**Type consistency:** MediaItem interface defined in Task 1, used consistently in Tasks 2-4. Function signatures match across imports.
