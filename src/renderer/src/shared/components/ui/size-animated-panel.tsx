import * as React from 'react'

import { cn } from '@renderer/shared/lib/utils'

export interface SizeAnimatedPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  expanded: boolean
  reducedMotion?: boolean
  contentClassName?: string
  children: React.ReactNode
}

export const SizeAnimatedPanel = React.forwardRef<HTMLDivElement, SizeAnimatedPanelProps>(({
  expanded,
  reducedMotion = false,
  className,
  contentClassName,
  children,
  ...props
}, ref) => {
  const inertProps = expanded ? {} : ({ inert: '' } as Record<string, string>)

  return (
    <div
      ref={ref}
      data-state={expanded ? 'expanded' : 'collapsed'}
      aria-hidden={expanded ? undefined : true}
      className={cn(
        'grid overflow-hidden',
        expanded ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
        reducedMotion
          ? 'transition-none'
          : 'transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
        className
      )}
      {...inertProps}
      {...props}
    >
      <div className={cn('min-h-0 overflow-hidden', contentClassName)}>
        {children}
      </div>
    </div>
  )
})

SizeAnimatedPanel.displayName = 'SizeAnimatedPanel'
