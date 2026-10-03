import { CornerDownLeft, Ellipsis, Image, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@renderer/shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/shared/components/ui/dropdown-menu'
import type { QueuedChatMessage } from './queuePolicy'

interface QueuedMessageRailProps {
  message: QueuedChatMessage
  remainingCount: number
  paused?: boolean
  compacting?: boolean
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

  if (message.textAttachments?.length) return message.textAttachments.map(item => item.filename).join(', ')

  const imageCount = message.images.filter(Boolean).length
  return imageCount === 1 ? '1 image queued' : `${imageCount} images queued`
}

export function QueuedMessageRail({
  message,
  remainingCount,
  paused = false,
  compacting = false,
  canInsert,
  onInsert,
  onEdit,
  onRemove
}: QueuedMessageRailProps): React.JSX.Element {
  const isInserting = message.status === 'inserting'
  const preview = getQueuedMessagePreview(message)
  const statusLabel = compacting ? 'Compacting' : isInserting ? 'Guiding' : paused ? 'Paused' : 'Next'
  const actionLabel = compacting ? 'Compacting' : isInserting ? 'Waiting' : 'Insert'
  const actionDisabled = compacting || isInserting || paused || !canInsert

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
        aria-label={compacting ? `Compacting context before insert: ${preview}` : isInserting ? `Waiting to insert: ${preview}` : `Insert queued message: ${preview}`}
      >
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-md px-1.5 transition-[background-color,box-shadow] duration-[180ms] ease-out',
            'group-focus-visible:bg-foreground/5.5',
            '[@media(hover:hover)]:group-hover:bg-foreground/5.5',
            'motion-reduce:transition-none'
          )}
        >
          {compacting || isInserting ? (
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
              '[@media(hover:hover)]:hover:bg-foreground/6 [@media(hover:hover)]:hover:text-foreground',
              'data-[state=open]:bg-foreground/6 data-[state=open]:text-foreground',
              'disabled:cursor-default disabled:opacity-35 disabled:active:scale-100'
            )}
            aria-label="Queued message actions"
          >
            <Ellipsis aria-hidden="true" className="size-3.5" strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={6}
          aria-label="Queued message actions"
          className={cn(
            'w-40 rounded-[10px] border-black/8 bg-popover p-1 text-popover-foreground',
            'shadow-[0_4px_16px_rgb(0_0_0/0.10),0_1px_3px_rgb(0_0_0/0.05)] dark:border-white/10 dark:shadow-[0_4px_16px_rgb(0_0_0/0.24),0_1px_3px_rgb(0_0_0/0.14)]',
            '[transform-origin:var(--radix-dropdown-menu-content-transform-origin)]',
            'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none'
          )}
        >
          <DropdownMenuItem
            className={cn(
              'group h-8 gap-2 rounded-md px-2 text-xs font-medium text-foreground/78',
              'transition-[background-color,color] duration-120 ease-out',
              'focus:bg-black/7 dark:focus:bg-white/10 focus:text-foreground data-highlighted:bg-black/7 dark:data-highlighted:bg-white/10 data-highlighted:text-foreground motion-reduce:transition-none'
            )}
            onSelect={onEdit}
          >
            <Pencil
              aria-hidden="true"
              className="size-3.5! text-muted-foreground transition-colors duration-120 group-focus:text-foreground group-data-highlighted:text-foreground motion-reduce:transition-none"
              strokeWidth={1.9}
            />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(
              'group h-8 gap-2 rounded-md px-2 text-xs font-medium text-rose-600 dark:text-rose-300',
              'transition-[background-color,color] duration-120 ease-out',
              'focus:bg-rose-500/[0.09] focus:text-rose-700 dark:focus:text-rose-200 motion-reduce:transition-none'
            )}
            onSelect={onRemove}
          >
            <Trash2 aria-hidden="true" className="size-3.5!" strokeWidth={1.9} />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export { getQueuedMessagePreview }
