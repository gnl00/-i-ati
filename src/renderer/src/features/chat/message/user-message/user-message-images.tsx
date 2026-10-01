import { useRef } from 'react'
import {
  ImageViewer,
  PreviewImage,
  type ImagePreviewSource,
} from '@renderer/shared/components/image-viewer'
import { cn } from '@renderer/shared/lib/utils'

export function UserMessageImages({
  urls,
  isPending,
}: {
  urls: string[]
  isPending: boolean
}): React.ReactElement {
  const thumbnailsRef = useRef<(HTMLButtonElement | null)[]>([])
  const visibleUrls = urls.slice(0, 4)
  const single = urls.length === 1
  const getSource = (index: number): ImagePreviewSource => {
    const element = thumbnailsRef.current[Math.min(index, 3)]
    const viewport = element
      ?.closest('[data-slot="message-scroller-viewport"]')
      ?.getBoundingClientRect()
    const item = element?.closest<HTMLElement>(
      '[data-slot="message-scroller-item"]',
    )
    const topMargin = item
      ? parseFloat(window.getComputedStyle(item).scrollMarginBlockStart) || 0
      : 0
    return {
      element,
      fadeOnClose: index >= 4,
      viewport: viewport
        ? {
            top: viewport.top + topMargin,
            right: viewport.right,
            bottom: viewport.bottom,
            left: viewport.left,
          }
        : undefined,
    }
  }
  return (
    <ImageViewer urls={urls} getSource={getSource}>
      {(open) => (
        <div
          data-testid="user-message-images"
          aria-label={`${urls.length} image${single ? '' : 's'}`}
          className={cn('grid max-w-[85%] gap-2', isPending && 'opacity-75')}
          style={{
            width: single
              ? 128
              : visibleUrls.length * 96 + (visibleUrls.length - 1) * 8,
            gridTemplateColumns: `repeat(${visibleUrls.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleUrls.map((url, index) => (
            <button
              key={`${index}:${url}`}
              type="button"
              ref={(node) => {
                thumbnailsRef.current[index] = node
              }}
              aria-label={
                index === 3 && urls.length > 4
                  ? `View ${urls.length - 3} more images`
                  : `Open image ${index + 1} of ${urls.length}`
              }
              onClick={(event) => {
                open(index, event.detail > 0)
              }}
              className={cn(
                'relative min-w-0 overflow-hidden rounded-[10px] border border-(--chat-border-subtle) bg-white p-1 transition-colors duration-150 hover:border-(--chat-border-standard) hover:bg-(--chat-surface-hover) active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) dark:bg-(--chat-surface) dark:hover:bg-(--chat-surface-hover)',
                single ? 'h-24' : 'aspect-square',
              )}
            >
              <PreviewImage key={url} src={url} alt={`Image ${index + 1}`} />
              {index === 3 && urls.length > 4 && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-lg font-semibold text-white"
                >
                  +{urls.length - 3}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </ImageViewer>
  )
}
