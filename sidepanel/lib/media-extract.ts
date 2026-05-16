const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)(\?|$)/i
const IMAGE_PATH_RE = /\/(upload|images|media|img|asset)\//i
const BASE64_RE = /^data:image\/[a-z0-9.+_-]+;base64,/i
const HTTP_URL_RE = /^https?:\/\/[^\s"'<>[\]{}]+/i
const CODE_BLOCK_RE = /^```([a-z]*)\n([\s\S]*?)```$/m
const GOOGLE_MEDIA_HOSTS = /(?:googleusercontent\.com|ggpht\.com|googleapis\.com)/i
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const HTML_IMG_PATTERN = /<img[^>]+src=["']([^"']+)["']/gi

function isImageUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  if (BASE64_RE.test(value)) return true
  if (IMAGE_URL_RE.test(value)) return true
  if (HTTP_URL_RE.test(value) && IMAGE_PATH_RE.test(value)) return true
  return false
}

function isFileUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  if (BASE64_RE.test(value)) return false
  if (!HTTP_URL_RE.test(value)) return false
  const ext = value.split('?')[0].split('.').pop()?.toLowerCase()
  const fileExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'tar', 'gz', 'rar', 'mp3', 'mp4', 'wav', 'avi', 'mov']
  return !!ext && fileExts.includes(ext)
}

function isHttpUrl(value: string): boolean {
  return typeof value === 'string' && HTTP_URL_RE.test(value)
}

function isCodeBlock(value: string): boolean {
  return typeof value === 'string' && CODE_BLOCK_RE.test(value)
}

function classifyMediaUrl(url: string, context?: string): MediaItem['type'] {
  if (context && /generated|generation/i.test(context)) {
    return 'Generated Image'
  }
  if (context && /code|snippet|```/i.test(context)) {
    return 'Code Block'
  }
  if (IMAGE_URL_RE.test(url) || BASE64_RE.test(url) || GOOGLE_MEDIA_HOSTS.test(url)) {
    return 'Image'
  }
  return 'File'
}

export interface MediaItem {
  type: 'Generated Image' | 'Image' | 'File' | 'Code Block'
  url: string
  thumbnail?: string
  name?: string
}

export interface MediaExtractionResult {
  images: string[]
  files: string[]
  codeBlocks: string[]
  links: string[]
  allUrls: string[]
}

export function extractMediaFromMessages(messages: any[]): MediaItem[] {
  const media: MediaItem[] = []
  const seen = new Set<string>()

  for (const msg of messages) {
    const content = msg?.content || ''
    if (typeof content !== 'string') continue

    for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
      const url = match[2]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url, name: match[1] || undefined })
      }
    }

    for (const match of content.matchAll(HTML_IMG_PATTERN)) {
      const url = match[1]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url })
      }
    }

    const urlPattern = /https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp|svg)(\?[^\s"'<>]*)?/gi
    for (const match of content.matchAll(urlPattern)) {
      const url = match[0]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url })
      }
    }

    const googlePattern = /https?:\/\/[^\s"'<>]*(?:googleusercontent\.com|ggpht\.com)[^\s"'<>]*/gi
    for (const match of content.matchAll(googlePattern)) {
      const url = match[0]
      if (!seen.has(url)) {
        seen.add(url)
        media.push({ type: classifyMediaUrl(url, content), url })
      }
    }

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

function scanObjectForUrls(obj: any, context: string, media: MediaItem[], seen: Set<string>) {
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

export function extractMediaFromRaw(raw: any): MediaExtractionResult {
  const result: MediaExtractionResult = {
    images: [],
    files: [],
    codeBlocks: [],
    links: [],
    allUrls: [],
  }

  const seen = new Set<string>()

  function add(arr: string[], value: string) {
    if (value && !seen.has(value)) {
      seen.add(value)
      arr.push(value)
    }
  }

  function scan(value: any) {
    if (value === null || value === undefined) return

    if (Array.isArray(value)) {
      for (const item of value) {
        scan(item)
      }
      return
    }

    if (typeof value === 'object') {
      for (const key of Object.keys(value)) {
        scan(value[key])
      }
      return
    }

    if (typeof value !== 'string') return

    if (isCodeBlock(value)) {
      add(result.codeBlocks, value)
    }

    if (isImageUrl(value)) {
      add(result.images, value)
      add(result.allUrls, value)
      return
    }

    if (isFileUrl(value)) {
      add(result.files, value)
      add(result.allUrls, value)
      return
    }

    if (isHttpUrl(value)) {
      add(result.links, value)
      add(result.allUrls, value)
    }
  }

  scan(raw)
  return result
}

export function extractMediaItemsFromRaw(raw: any[]): MediaItem[] {
  const media: MediaItem[] = []
  const seen = new Set<string>()
  scanObjectForUrls(raw, '', media, seen)
  return media
}
