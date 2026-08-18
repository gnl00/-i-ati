import { cn } from '@renderer/shared/lib/utils'
import type { LucideIcon } from 'lucide-react'
import React from 'react'

export type SupportSegmentHeaderTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface SupportSegmentHeaderProps {
  icon: LucideIcon
  name: string
  description?: React.ReactNode
  duration?: React.ReactNode
  trailing?: React.ReactNode
  tone?: SupportSegmentHeaderTone
  density?: 'regular' | 'compact'
  isOpen?: boolean
  dataTestId?: string
  className?: string
  nameClassName?: string
  descriptionClassName?: string
  durationClassName?: string
  iconClassName?: string
  testIds?: {
    icon?: string
    name?: string
    description?: string
    duration?: string
    trailing?: string
  }
}

const iconToneClassNames: Record<SupportSegmentHeaderTone, string> = {
  neutral: 'text-slate-500 dark:text-(--chat-text-secondary)',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-200',
  danger: 'text-red-600 dark:text-red-300'
}

const iconWellToneClassNames: Record<SupportSegmentHeaderTone, string> = {
  neutral: 'border-slate-200/60 bg-slate-100/65 dark:border-(--chat-border-standard) dark:bg-(--chat-surface-raised)',
  success: 'border-emerald-200/70 bg-emerald-50/85 dark:border-emerald-900/42 dark:bg-emerald-950/24',
  warning: 'border-amber-200/70 bg-amber-50/85 dark:border-amber-900/45 dark:bg-amber-950/26',
  danger: 'border-red-200/70 bg-red-50/85 dark:border-red-900/45 dark:bg-red-950/28'
}

export const getSupportDisclosureTriggerClassName = (isOpen: boolean): string => cn(
  'group/support flex w-full cursor-pointer items-center overflow-hidden rounded-[10px] border px-2 py-1.5 text-left shadow-none outline-hidden',
  'transition-[background-color,border-color] duration-150 ease-out motion-reduce:transition-none',
  'hover:border-slate-200/60 hover:bg-slate-50/70 dark:hover:border-(--chat-border-standard) dark:hover:bg-(--chat-surface-hover)',
  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/65 dark:focus-visible:ring-slate-500/75',
  isOpen
    ? 'border-slate-200/60 bg-slate-50/65 dark:border-(--chat-border-standard) dark:bg-(--chat-surface-raised)'
    : 'border-slate-200/35 bg-white/30 dark:border-(--chat-border-subtle) dark:bg-(--chat-surface)'
)

export const SupportSegmentHeader = React.memo(({
  icon: Icon,
  name,
  description,
  duration,
  trailing,
  tone = 'neutral',
  density = 'regular',
  isOpen = false,
  dataTestId,
  className,
  nameClassName,
  descriptionClassName,
  durationClassName,
  iconClassName,
  testIds
}: SupportSegmentHeaderProps) => {
  const isCompact = density === 'compact'

  return (
    <span
      data-testid={dataTestId ?? 'support-segment-header'}
      className={cn(
        'grid w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center text-slate-600 dark:text-(--chat-text-body)',
        isCompact ? 'gap-x-2' : 'gap-x-2.5',
        className
      )}
    >
      <span
        data-testid={testIds?.icon}
        className={cn(
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
          'transition-transform duration-150 ease-out motion-reduce:transition-none',
          isOpen && 'scale-[1.03]',
          iconWellToneClassNames[tone]
        )}
        aria-hidden="true"
      >
        <Icon
          className={cn(
            'h-3 w-3',
            iconToneClassNames[tone],
            iconClassName
          )}
        />
      </span>
      <span className="flex min-w-0 items-baseline gap-2 overflow-hidden">
        <span
          data-testid={testIds?.name}
          className={cn(
            'block shrink-0 truncate font-semibold uppercase leading-none tracking-wide',
            isCompact ? 'text-[10px]' : 'text-[10.5px]',
            'text-slate-500 dark:text-(--chat-text-body)',
            nameClassName
          )}
        >
          {name}
        </span>
        {description ? (
          <span
            data-testid={testIds?.description}
            title={typeof description === 'string' ? description : undefined}
            className={cn(
              'block min-w-0 flex-1 truncate whitespace-nowrap font-medium leading-snug text-slate-400 dark:text-(--chat-text-muted)',
              isCompact ? 'text-[10px]' : 'text-[10.5px]',
              descriptionClassName
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
      {duration ? (
        <span
          data-testid={testIds?.duration ?? 'support-segment-header-duration'}
          className={cn(
            'col-start-3 shrink-0 justify-self-end text-right font-medium tabular-nums leading-none text-slate-400 dark:text-(--chat-text-secondary)',
            isCompact ? 'text-[10px]' : 'text-[10.5px]',
            durationClassName
          )}
        >
          {duration}
        </span>
      ) : null}
      {trailing ? (
        <span
          data-testid={testIds?.trailing}
          className="col-start-4 inline-flex shrink-0 items-center justify-center text-slate-400 dark:text-(--chat-text-secondary)"
        >
          {trailing}
        </span>
      ) : null}
    </span>
  )
})

SupportSegmentHeader.displayName = 'SupportSegmentHeader'
