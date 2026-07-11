import React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/shared/components/ui/popover'
import { cn } from '@renderer/shared/lib/utils'

export interface AssistantSegmentPopoutTriggerState {
  isOpen: boolean
}

interface AssistantSegmentPopoutProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  renderTrigger: (state: AssistantSegmentPopoutTriggerState) => React.ReactElement
  children: React.ReactNode
  contentClassName?: string
}

export const AssistantSegmentPopout: React.FC<AssistantSegmentPopoutProps> = ({
  open,
  onOpenChange,
  renderTrigger,
  children,
  contentClassName
}) => {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {renderTrigger({ isOpen: open })}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className={cn(
          'app-undragable w-[min(760px,calc(100vw-32px))] max-h-[min(520px,calc(100vh-96px))] overflow-hidden rounded-2xl border bg-white/95 p-0 text-popover-foreground shadow-xl shadow-slate-950/10 backdrop-blur-md dark:bg-zinc-950/95 dark:shadow-black/30',
          contentClassName ?? 'border-slate-200/70 dark:border-slate-800/70'
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
