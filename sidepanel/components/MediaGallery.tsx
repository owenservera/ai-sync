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