# Media Download Feature Design

**Date**: 2026-05-16
**Topic**: Gemini Conversation Media Download

## Overview

Add capability to extract and download media (images, files, generated images, code blocks) from Gemini conversations. Currently the extension only downloads text.

## Architecture

### Data Flow

1. User enters conversation ID in CapabilitiesPanel media test card
2. Sidepanel sends `TEST_DOWNLOAD_MEDIA` message to service worker
3. Service worker calls `provider.getConversation(account, conversationId)` to fetch full conversation
4. Media extraction functions scan message content and raw API response for media URLs
5. Media objects classified by type and returned to sidepanel
6. MediaGallery component displays extracted media in grid/list layout
7. Download button per item triggers `chrome.downloads.download()`

### New Files

**`sidepanel/lib/media-extract.ts`**
- `extractMediaFromMessages(messages: any[]): MediaItem[]` — scans message content strings
- `extractMediaFromRaw(raw: any[]): MediaItem[]` — recursively scans raw Gemini API response array

**`sidepanel/components/MediaGallery.tsx`**
- Displays extracted media from a conversation
- Grid layout for images (3-column, thumbnails expand on click)
- List layout for files (with download button)
- Media type badges: Image, File, Generated Image, Code Block
- Props: `{ media: Array<MediaItem> }`

### Modified Files

**`background/service_worker.ts`**
- Add `TEST_DOWNLOAD_MEDIA` to the message handler switch
- Add case in `handleCapabilityTest`: fetches conversation, extracts media, returns result

**`sidepanel/components/CapabilitiesPanel.tsx`**
- Add media test card to CAPABILITIES array
- Add form field for conversation ID
- On success: render MediaGallery with extracted media

## Media Extraction Patterns

### extractMediaFromMessages

Scans `Message.content` strings for:
- Markdown image syntax: `![alt](url)`
- HTML img tags: `<img src="url">`
- Direct image URLs ending in: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
- Data URIs: `data:image/...`
- Google-hosted media: `*.googleusercontent.com`, `*.ggpht.com`

### extractMediaFromRaw

Recursively scans raw Gemini API response array for:
- Objects with keys: `url`, `imageUrl`, `attachmentUrl`, `thumbnailUrl`
- Nested arrays containing URL-like strings
- Classifies by context: generated vs uploaded vs code block

### Type Classification

| Type | Criteria |
|------|----------|
| Generated Image | From Gemini image generation responses (contains `generated` or `generation` in context) |
| Image | User-uploaded or referenced images |
| File | Documents, PDFs, other non-image attachments |
| Code Block | Extracted code with syntax highlighting metadata |

### MediaItem Interface

```typescript
interface MediaItem {
  type: 'Generated Image' | 'Image' | 'File' | 'Code Block'
  url: string
  thumbnail?: string
  name?: string
}
```

## Error Handling

- No media found → display "No media found in this conversation"
- Failed URL extraction → log warning, return empty array
- Download failures → browser handles errors natively via chrome.downloads API
- No conversation found → throw error with message "Conversation not found"

## Dependencies

- lucide-react: Image, FileText, Download, Code, X icons
- shadcn components: Card, Badge, Button (already available)
- chrome.downloads API for file downloads
