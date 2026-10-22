import { SizeAnimatedPanel } from '@renderer/shared/components/ui/size-animated-panel'
import { WorkProgressMetadata } from './WorkProgressMetadata'
import { cn } from '@renderer/shared/lib/utils'
import { useReducedMotion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import React from 'react'

export interface AssistantCompletedWorkGroupProps {
  children: React.ReactNode
  status?: ChatMessage['workStatus']
  toolCount?: number
  startedAt?: number
  endedAt?: number
  forceReducedMotion?: boolean
}

const labels = {
  running: 'Working',
  completed: 'Work details',
  incomplete: 'Incomplete',
  failed: 'Failed',
  aborted: 'Stopped'
}

export const AssistantCompletedWorkGroup: React.FC<AssistantCompletedWorkGroupProps> = ({
  children,
  status = 'completed',
  toolCount = 0,
  startedAt,
  endedAt,
  forceReducedMotion = false
}) => {
  // An explicit user choice survives both streaming updates and completion.
  const [userExpanded, setUserExpanded] = React.useState<boolean>()
  const previousStatus = React.useRef(status)
  React.useLayoutEffect(() => {
    if (previousStatus.current !== status && ['failed', 'aborted', 'incomplete'].includes(status)) {
      setUserExpanded(undefined)
    }
    previousStatus.current = status
  }, [status])
  const isOpen = userExpanded ?? status !== 'completed'
  const prefersReducedMotion = useReducedMotion()
  const panelId = React.useId()

  return (
    <div data-testid="assistant-completed-work-group" className="my-1.5 w-full min-w-0">
      <button
        type="button"
        aria-label={isOpen ? 'Collapse work details' : 'Expand work details'}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setUserExpanded(!isOpen)}
        className={cn(
          'flex max-w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-slate-500 outline-hidden',
          'hover:bg-slate-100/60 active:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400/65',
          'dark:text-(--chat-text-secondary) dark:hover:bg-(--chat-surface-hover) dark:active:bg-(--chat-surface-raised)'
        )}
      >
        <span data-testid="completed-work-label">{labels[status]}</span>
        <WorkProgressMetadata toolCount={toolCount} startedAt={startedAt} endedAt={endedAt} running={status === 'running'} />
        <ChevronRight aria-hidden="true" className={cn('ml-1 h-3 w-3 shrink-0', isOpen && 'rotate-90')} />
      </button>
      <SizeAnimatedPanel
        id={panelId}
        expanded={isOpen}
        reducedMotion={forceReducedMotion || Boolean(prefersReducedMotion)}
        data-testid="completed-work-panel"
      >
        <div
          className="flex min-w-0 flex-col py-1"
          onFocusCapture={() => setUserExpanded(true)}
        >
          {children}
        </div>
      </SizeAnimatedPanel>
    </div>
  )
}
