import { cn } from '@renderer/lib/utils'
import type { LucideIcon } from 'lucide-react'
import React from 'react'

export type SupportSegmentHeaderTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface SupportSegmentHeaderProps {
  icon: LucideIcon
  name: string
  duration?: React.ReactNode
  tone?: SupportSegmentHeaderTone
  density?: 'regular' | 'compact'
  isOpen?: boolean
  className?: string
  nameClassName?: string
  iconClassName?: string
  hoverResponse?: 'subtle' | 'none'
}

const toneClassNames: Record<SupportSegmentHeaderTone, string> = {
  neutral: 'bg-slate-100/80 text-slate-600 dark:bg-white/6 dark:text-slate-300',
  success: 'bg-emerald-100/85 text-emerald-700 dark:bg-emerald-900/24 dark:text-emerald-300',
  warning: 'bg-amber-100/85 text-amber-700 dark:bg-amber-900/24 dark:text-amber-200',
  danger: 'bg-red-100/85 text-red-700 dark:bg-red-900/24 dark:text-red-300'
}

export const SupportSegmentHeader = React.memo(({
  icon: Icon,
  name,
  duration,
  tone = 'neutral',
  density = 'regular',
  isOpen = false,
  className,
  nameClassName,
  iconClassName,
  hoverResponse = 'subtle'
}: SupportSegmentHeaderProps) => {
  const isCompact = density === 'compact'

  return (
    <span
      data-testid="support-segment-header"
      className={cn(
        'inline-flex max-w-full items-center text-slate-600 transition-colors duration-150 ease-out dark:text-slate-300',
        hoverResponse === 'subtle' && 'group-hover:bg-slate-100/55 dark:group-hover:bg-white/4',
        isCompact ? 'gap-1.5 rounded-lg px-1.5 py-0.5 text-[10px]' : 'gap-2 rounded-lg px-2 py-1 text-[11px]',
        className
      )}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-lg transition-transform duration-200 ease-out',
          isCompact ? 'h-5 w-5' : 'h-6 w-6',
          toneClassNames[tone]
        )}
        aria-hidden="true"
      >
        <Icon
          className={cn(
            isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5',
            isOpen && 'rotate-6 scale-105',
            iconClassName
          )}
        />
      </span>
      <span
        className={cn(
          'min-w-0 truncate uppercase font-semibold leading-none tracking-wide',
          isCompact ? 'text-[10px]' : 'text-[11px]',
          tone === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300',
          nameClassName
        )}
      >
        {name}
      </span>
      {duration ? (
        <span
          data-testid="support-segment-header-duration"
          className={cn(
            'shrink-0 tabular-nums leading-none text-slate-400/90 dark:text-slate-300',
            isCompact ? 'text-[10px]' : 'text-[10px]'
          )}
        >
          {' · '}
          {duration}
        </span>
      ) : null}
    </span>
  )
})

SupportSegmentHeader.displayName = 'SupportSegmentHeader'
