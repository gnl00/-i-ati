import { CornerDownLeft, Ellipsis, Image, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@renderer/shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/shared/components/ui/dropdown-menu'
import type { QueuedChatMessage } from './queuePolicy'

interface QueuedMessageRailProps {
  message: QueuedChatMessage
  remainingCount: number
  paused?: boolean
  canInsert: boolean
  onInsert: () => void
  onEdit: () => void
  onRemove: () => void
}

function getQueuedMessagePreview(message: QueuedChatMessage): string {
  const normalizedText = message.text.trim().replace(/\s+/g, ' ')
  if (normalizedText) {
    return normalizedText
  }

  const imageCount = message.images.filter(Boolean).length
  return imageCount === 1 ? '1 image queued' : `${imageCount} images queued`
}

export function QueuedMessageRail({
  message,
  remainingCount,
  paused = false,
  canInsert,
  onInsert,
  onEdit,
  onRemove
}: QueuedMessageRailProps): React.JSX.Element {
  const isInserting = message.status === 'inserting'
  const preview = getQueuedMessagePreview(message)
  const statusLabel = isInserting ? 'Guiding' : paused ? 'Paused' : 'Next'
  const actionLabel = isInserting ? 'Waiting' : 'Insert'
  const actionDisabled = isInserting || paused || !canInsert

  return (
    <div
      className="queued-message-rail flex h-8 min-w-0 items-center gap-1.5 px-2.5 text-[11px] text-muted-foreground"
    >
      <span className="sr-only" role="status" aria-live="polite">
        {statusLabel}: {preview}
      </span>
      <span
        className={cn(
          'shrink-0 font-semibold uppercase tracking-[0.14em]',
          isInserting
            ? 'text-emerald-600/90 dark:text-emerald-300/90'
            : paused
              ? 'text-rose-600/90 dark:text-rose-300/90'
              : 'text-amber-700/90 dark:text-amber-300/90'
        )}
      >
        {statusLabel}
      </span>

      <span aria-hidden="true" className="shrink-0 text-border/90">·</span>

      {message.text.trim().length === 0 && (
        <Image aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.8} />
      )}
      <span className="queued-message-preview min-w-0 flex-1 font-medium text-foreground/72" title={preview}>
        {preview}
      </span>

      {remainingCount > 0 && (
        <span className="shrink-0 font-semibold tabular-nums text-muted-foreground/72">
          +{remainingCount}
        </span>
      )}

      <button
        type="button"
        className={cn(
          'group relative -my-1 ml-0.5 inline-flex h-8 shrink-0 touch-manipulation items-center p-0 font-semibold',
          'text-foreground/68 transition-[color,scale] duration-180 ease-out',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background/60',
          'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
          '[@media(hover:hover)]:hover:text-foreground',
          'disabled:cursor-default disabled:text-muted-foreground/50 disabled:active:scale-100'
        )}
        disabled={actionDisabled}
        onClick={onInsert}
        aria-label={isInserting ? `Waiting to insert: ${preview}` : `Insert queued message: ${preview}`}
      >
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-md px-1.5 transition-[background-color,box-shadow] duration-[180ms] ease-out',
            'group-focus-visible:bg-foreground/5.5',
            '[@media(hover:hover)]:group-hover:bg-foreground/5.5',
            'motion-reduce:transition-none'
          )}
        >
          {isInserting ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.9} />
          ) : (
            <CornerDownLeft aria-hidden="true" className="size-3.5" strokeWidth={1.9} />
          )}
          <span>{actionLabel}</span>
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={isInserting}>
          <button
            type="button"
            className={cn(
              'group relative -my-1 inline-flex h-8 w-6 shrink-0 touch-manipulation items-center justify-center rounded-md',
              'text-muted-foreground/64 transition-[background-color,color,scale] duration-180 ease-out',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background/60',
              'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
              '[@media(hover:hover)]:hover:text-foreground',
              'data-[state=open]:bg-foreground/[0.055] data-[state=open]:text-foreground',
              'disabled:cursor-default disabled:opacity-35 disabled:active:scale-100'
            )}
            aria-label="Queued message actions"
          >
            <span
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-[5px]',
                'transition-[background-color,box-shadow] duration-180 ease-out',
                'group-focus-visible:bg-foreground/4.5',
                '[@media(hover:hover)]:group-hover:bg-foreground/4.5',
                'motion-reduce:transition-none'
              )}
            >
              <Ellipsis aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={6}
          aria-label="Queued message actions"
          className={cn(
            'w-40 rounded-[14px] border-black/[0.08] bg-popover/98 p-1.5 text-popover-foreground',
            'shadow-2xl shadow-black/12 backdrop-blur-2xl dark:border-white/10 dark:shadow-black/35',
            '[transform-origin:var(--radix-dropdown-menu-content-transform-origin)]',
            'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none'
          )}
        >
          <DropdownMenuItem
            className={cn(
              'group h-8 rounded-[9px] px-2.5 text-xs font-medium text-foreground/78',
              'transition-[background-color,color] duration-150 ease-out',
              'focus:bg-foreground/[0.055] focus:text-foreground motion-reduce:transition-none'
            )}
            onSelect={onEdit}
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-foreground/[0.045] text-muted-foreground transition-colors duration-150 group-focus:bg-foreground/[0.075] group-focus:text-foreground motion-reduce:transition-none">
              <Pencil aria-hidden="true" className="size-3!" strokeWidth={1.9} />
            </span>
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator className="mx-1 my-1 bg-border/45" />
          <DropdownMenuItem
            className={cn(
              'group h-8 rounded-[9px] px-2.5 text-xs font-medium text-rose-600 dark:text-rose-300',
              'transition-[background-color,color] duration-150 ease-out',
              'focus:bg-rose-500/[0.09] focus:text-rose-700 dark:focus:text-rose-200 motion-reduce:transition-none'
            )}
            onSelect={onRemove}
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-rose-500/[0.075] text-rose-500 transition-colors duration-150 group-focus:bg-rose-500/[0.13] group-focus:text-rose-600 dark:text-rose-300 motion-reduce:transition-none">
              <Trash2 aria-hidden="true" className="size-3!" strokeWidth={1.9} />
            </span>
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export { getQueuedMessagePreview }
