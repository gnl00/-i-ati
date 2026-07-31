import { SizeAnimatedPanel } from '@renderer/shared/components/ui/size-animated-panel'
import { cn } from '@renderer/shared/lib/utils'
import { useReducedMotion } from 'framer-motion'
import { ChevronDown, ListChecks } from 'lucide-react'
import React from 'react'
import { SupportSegmentHeader } from './SupportSegmentHeader'

export interface AssistantCompletedWorkGroupProps {
  children: React.ReactNode
  forceReducedMotion?: boolean
}

export const AssistantCompletedWorkGroup: React.FC<AssistantCompletedWorkGroupProps> = ({
  children,
  forceReducedMotion = false
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const prefersReducedMotion = useReducedMotion()
  const shouldReduceMotion = forceReducedMotion || Boolean(prefersReducedMotion)
  const panelId = React.useId()

  return (
    <div
      data-testid="assistant-completed-work-group"
      className="my-1.5 w-full max-w-full px-2"
    >
      <button
        type="button"
        aria-label={isOpen ? 'Collapse completed work' : 'Expand completed work'}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(current => !current)}
        className={cn(
          'group/support flex w-full cursor-pointer items-center border-b py-1.5 text-left shadow-none outline-hidden',
          'bg-transparent transition-[background-color,border-color] duration-150 ease-out motion-reduce:transition-none',
          'hover:border-slate-200/50 hover:bg-slate-50/55 dark:hover:border-white/8 dark:hover:bg-white/[0.025]',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/65 dark:focus-visible:ring-slate-500/75',
          isOpen
            ? 'border-slate-200/50 bg-slate-50/45 dark:border-white/8 dark:bg-white/[0.025]'
            : 'border-slate-200/30 dark:border-white/5'
        )}
      >
        <SupportSegmentHeader
          icon={ListChecks}
          name="Work completed"
          isOpen={isOpen}
          trailing={(
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none',
                isOpen && 'rotate-180'
              )}
            />
          )}
          testIds={{
            icon: 'completed-work-icon',
            name: 'completed-work-label',
            description: 'completed-work-description',
            duration: 'completed-work-duration',
            trailing: 'completed-work-chevron'
          }}
        />
      </button>
      <SizeAnimatedPanel
        id={panelId}
        expanded={isOpen}
        reducedMotion={shouldReduceMotion}
        className="mt-1"
        data-testid="completed-work-panel"
      >
        <div className="py-1">
          {children}
        </div>
      </SizeAnimatedPanel>
    </div>
  )
}

AssistantCompletedWorkGroup.displayName = 'AssistantCompletedWorkGroup'
