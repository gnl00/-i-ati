import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { PreviewImage } from './PreviewImage'
import {
  useImagePreviewMotion,
  type ImagePreviewSource,
} from './use-image-preview-motion'

export function ImageViewer({
  urls,
  getSource,
  children,
}: {
  urls: string[]
  getSource: (index: number) => ImagePreviewSource
  children: (open: (index: number, animate: boolean) => void) => React.ReactNode
}): React.ReactElement {
  const motion = useImagePreviewMotion(urls, getSource)
  const { previewIndex, phase } = motion
  const moveImage = (direction: number, animate: boolean): void => {
    if (previewIndex !== null && urls.length > 0)
      motion.switchImage(
        (previewIndex + direction + urls.length) % urls.length,
        animate,
      )
  }
  const navigationClass =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 active:scale-95 motion-reduce:active:scale-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent)'
  return (
    <>
      {children(motion.open)}
      <DialogPrimitive.Root
        open={previewIndex !== null}
        onOpenChange={(open) => {
          if (!open) motion.close(false)
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            ref={motion.overlayRef}
            onClick={(event) => event.stopPropagation()}
            data-testid="image-preview-overlay"
            className="fixed inset-0 z-[100] bg-black/80"
            style={{ opacity: phase === 'open' ? 1 : 0 }}
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            data-phase={phase}
            className="fixed left-1/2 top-1/2 z-[100] grid w-[calc(100%_-_32px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-3 outline-hidden"
            onClick={(event) => {
              event.stopPropagation()
              if (
                event.target instanceof Element &&
                !event.target.closest('img, [role="img"], button')
              )
                motion.close(event.detail > 0)
            }}
            onOpenAutoFocus={motion.onOpenReady}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              motion.restoreFocus()
            }}
            onPointerDownOutside={(event) => {
              event.preventDefault()
              motion.close(true)
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              motion.close(false)
            }}
            onKeyDown={(event) => {
              if (
                urls.length > 1 &&
                (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
              ) {
                event.preventDefault()
                moveImage(event.key === 'ArrowLeft' ? -1 : 1, false)
              }
            }}
          >
            <div
              ref={motion.chromeRef}
              data-image-preview-control
              className="flex items-center justify-between text-white/80"
              style={{ opacity: phase === 'open' ? 1 : 0 }}
            >
              <DialogPrimitive.Title className="text-[11px] font-medium leading-4">
                Image {(previewIndex ?? 0) + 1} of {urls.length}
              </DialogPrimitive.Title>
              <button
                type="button"
                aria-label="Close"
                className={navigationClass}
                onClick={(event) => motion.close(event.detail > 0)}
              >
                <X aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <div className="flex h-[min(70dvh,720px)] min-h-0 items-center justify-center gap-2">
              {urls.length > 1 && (
                <button
                  type="button"
                  data-image-preview-control
                  aria-label="Previous image"
                  style={{ opacity: phase === 'open' ? 1 : 0 }}
                  className={navigationClass}
                  onClick={(event) => moveImage(-1, event.detail > 0)}
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
              <div className="flex h-full min-w-0 flex-1 items-center justify-center">
                {previewIndex !== null && (
                  <PreviewImage
                    key={urls[previewIndex]}
                    src={urls[previewIndex]}
                    alt={`Image ${previewIndex + 1}`}
                    imageRef={motion.imageRef}
                    onReady={motion.onImageLoad}
                    className="h-auto w-auto max-h-full max-w-full"
                    style={{
                      transformOrigin: 'top left',
                      opacity: phase === 'open' ? 1 : 0,
                    }}
                  />
                )}
              </div>
              {urls.length > 1 && (
                <button
                  type="button"
                  data-image-preview-control
                  aria-label="Next image"
                  style={{ opacity: phase === 'open' ? 1 : 0 }}
                  className={navigationClass}
                  onClick={(event) => moveImage(1, event.detail > 0)}
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
