import { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useImagePreviewMotion } from './use-image-preview-motion';
import { cn } from '@renderer/shared/lib/utils';

function MessageImage({
  src,
  alt,
  imageRef,
  onReady,
  className,
  style,
}: {
  src: string;
  alt: string;
  imageRef?: React.Ref<HTMLImageElement>;
  onReady?: () => void;
  className?: string;
  style?: React.CSSProperties;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);

  return failed ? (
    <span
      role="img"
      aria-label={`${alt}: unavailable`}
      className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-[11px] text-(--chat-text-secondary)"
    >
      <ImageOff aria-hidden="true" className="h-4 w-4 shrink-0" />
      Image unavailable
    </span>
  ) : (
    <img
      ref={imageRef}
      src={src}
      alt={alt}
      onLoad={onReady}
      onError={() => {
        setFailed(true);
        onReady?.();
      }}
      className={cn("h-full w-full object-contain", className)}
      style={style}
    />
  );
}

export function UserMessageImages({
  urls,
  isPending,
}: {
  urls: string[];
  isPending: boolean;
}): React.ReactElement {
  const motion = useImagePreviewMotion();
  const { previewIndex, phase } = motion;
  const visibleUrls = urls.slice(0, 4);
  const single = urls.length === 1;
  const moveImage = (direction: number, animate: boolean): void => {
    if (previewIndex !== null)
      motion.switchImage(
        (previewIndex + direction + urls.length) % urls.length,
        animate,
      );
  };
  const navigationClass =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--chat-text-secondary) hover:bg-(--chat-surface-hover) active:scale-95 motion-reduce:active:scale-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent)';

  return (
    <>
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
              motion.thumbnailsRef.current[index] = node;
            }}
            aria-label={
              index === 3 && urls.length > 4
                ? `View ${urls.length - 3} more images`
                : `Open image ${index + 1} of ${urls.length}`
            }
            onClick={(event) => {
              motion.open(index, event.detail > 0);
            }}
            className={cn(
              'relative min-w-0 overflow-hidden rounded-[10px] border border-(--chat-border-subtle) bg-white p-1 transition-colors duration-150 hover:border-(--chat-border-standard) hover:bg-(--chat-surface-hover) active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) dark:bg-(--chat-surface) dark:hover:bg-(--chat-surface-hover)',
              single ? 'h-24' : 'aspect-square',
            )}
          >
            <MessageImage key={url} src={url} alt={`Image ${index + 1}`} />
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
      <DialogPrimitive.Root
        open={previewIndex !== null}
        onOpenChange={(open) => {
          if (!open) motion.close(false);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            ref={motion.overlayRef}
            data-testid="image-preview-overlay"
            className="fixed inset-0 z-50 bg-black/80"
            style={{ opacity: phase === 'open' ? 1 : 0 }}
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            data-phase={phase}
            className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%_-_32px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-3 outline-hidden"
            onOpenAutoFocus={motion.onOpenReady}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              motion.restoreFocus();
            }}
            onPointerDownOutside={(event) => {
              event.preventDefault();
              motion.close(true);
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              motion.close(false);
            }}
            onKeyDown={(event) => {
              if (
                urls.length > 1 &&
                (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
              ) {
                event.preventDefault();
                moveImage(event.key === 'ArrowLeft' ? -1 : 1, false);
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
                className={cn(
                  navigationClass,
                  'text-white/80 hover:bg-white/10',
                )}
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
                  className={cn(
                    navigationClass,
                    'text-white/80 hover:bg-white/10',
                  )}
                  onClick={(event) => moveImage(-1, event.detail > 0)}
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
              <div className="flex h-full min-w-0 flex-1 items-center justify-center">
                {previewIndex !== null && (
                  <MessageImage
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
                  className={cn(
                    navigationClass,
                    'text-white/80 hover:bg-white/10',
                  )}
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
  );
}
