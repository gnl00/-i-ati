import { SizeAnimatedPanel } from '@renderer/shared/components/ui/size-animated-panel'
import { cn } from '@renderer/shared/lib/utils'
import { useReducedMotion } from 'framer-motion'
import { ChevronDown, ListChecks } from 'lucide-react'
import React from 'react'
import {
  getSupportDisclosureTriggerClassName,
  SupportSegmentHeader
} from './SupportSegmentHeader'

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
      className="my-1.5 w-full max-w-full"
    >
      <button
        type="button"
        aria-label={isOpen ? 'Collapse completed work' : 'Expand completed work'}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(current => !current)}
        className={getSupportDisclosureTriggerClassName(isOpen)}
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
