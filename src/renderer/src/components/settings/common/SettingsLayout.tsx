import React from 'react'
import { cn } from '@renderer/lib/utils'

type DivProps = React.HTMLAttributes<HTMLDivElement>

interface SettingsPageShellProps extends DivProps {
  scrollable?: boolean
  contentClassName?: string
}

interface SettingsSectionHeaderProps extends Omit<DivProps, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  badges?: React.ReactNode
  actions?: React.ReactNode
}

interface SettingsEmptyStateProps extends Omit<DivProps, 'title'> {
  icon: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
}

interface SettingsFieldRowProps extends Omit<DivProps, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  control?: React.ReactNode
  contentClassName?: string
}

interface SettingsCollapsibleAreaProps extends DivProps {
  open: boolean
}

interface SettingsMetricItemProps extends DivProps {
  label: React.ReactNode
  value: React.ReactNode
  valueClassName?: string
}

interface SettingsNoticeProps extends DivProps {
  tone?: 'neutral' | 'warning' | 'danger'
}

interface SettingsSubsectionHeaderProps extends Omit<DivProps, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  badges?: React.ReactNode
  actions?: React.ReactNode
}

export const settingsScrollbarClassName = 'scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent'

export const settingsPrimaryButtonClassName = cn(
  'h-7 px-3 flex items-center gap-1.5 rounded-lg',
  'text-[11px] font-medium',
  'bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white',
  'text-white dark:text-gray-900',
  'active:scale-[0.97] transition-all duration-150',
  'shadow-sm shadow-gray-900/10',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const settingsSecondaryButtonClassName = cn(
  'h-7 px-2.5 flex items-center gap-1.5 rounded-md',
  'text-[11px] font-medium',
  'text-gray-500 dark:text-gray-400',
  'hover:text-gray-700 dark:hover:text-gray-200',
  'hover:bg-gray-100 dark:hover:bg-gray-700/50',
  'active:scale-[0.97] transition-all duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const settingsOutlineButtonClassName = cn(
  'h-7 px-3 flex items-center gap-1.5 rounded-md',
  'text-[11px] font-medium',
  'text-gray-600 dark:text-gray-300',
  'border border-gray-200 dark:border-gray-700',
  'hover:bg-gray-100 dark:hover:bg-gray-700/50',
  'active:scale-[0.97] transition-all duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const settingsIconButtonClassName = cn(
  'h-8 w-8 flex items-center justify-center rounded-lg',
  'border border-gray-200 dark:border-gray-700',
  'text-gray-500 dark:text-gray-300',
  'hover:bg-white dark:hover:bg-gray-800',
  'transition-colors duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const settingsDangerButtonClassName = cn(
  'h-7 px-3 flex items-center gap-1.5 rounded-md',
  'text-[11px] font-medium',
  'text-rose-600 dark:text-rose-300',
  'border border-rose-200 dark:border-rose-900/60',
  'hover:bg-rose-50 dark:hover:bg-rose-950/40',
  'active:scale-[0.97] transition-all duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const settingsInputClassName = cn(
  'focus-visible:ring-transparent focus-visible:ring-offset-0',
  'bg-white dark:bg-gray-800',
  'border-gray-200 dark:border-gray-700',
  'shadow-xs'
)

export const settingsSearchInputClassName = cn(
  settingsInputClassName,
  'h-9 pl-9 text-[12px]'
)

export const SettingsPageShell: React.FC<SettingsPageShellProps> = ({
  children,
  className,
  contentClassName,
  scrollable = false,
  ...props
}) => (
  <div
    className={cn(
      'w-full h-full min-h-0 min-w-0 overflow-hidden focus:ring-0 focus-visible:ring-0',
      className
    )}
    {...props}
  >
    <div
      className={cn(
        'w-full h-full min-w-0 min-h-0 p-1 pr-2',
        !scrollable && 'flex flex-col min-h-0',
        scrollable && 'overflow-y-auto',
        scrollable && settingsScrollbarClassName,
        contentClassName
      )}
    >
      {children}
    </div>
  </div>
)

export const SettingsSurface: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'h-full min-w-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden flex flex-col',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsMasterDetail: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'h-full min-w-0 overflow-hidden bg-gray-50 dark:bg-gray-900 p-1 rounded-xl flex gap-2',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsSidePanel: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'w-[184px] shrink-0 min-w-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden flex flex-col',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsDetailPanel: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'flex-1 min-w-0 h-full rounded-xl border border-gray-200/70 dark:border-gray-700/70 bg-white dark:bg-gray-800 shadow-xs overflow-hidden flex flex-col',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsSection = React.forwardRef<HTMLDivElement, DivProps>(({
  children,
  className,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-xs overflow-hidden',
      className
    )}
    {...props}
  >
    {children}
  </div>
))
SettingsSection.displayName = 'SettingsSection'

export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
  title,
  description,
  badges,
  actions,
  className,
  children,
  ...props
}) => (
  <div className={cn('px-4 py-4 flex items-start justify-between gap-3 min-w-0', className)} {...props}>
    <div className="space-y-1.5 min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <div className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
          {title}
        </div>
        {badges}
      </div>
      {description && (
        <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed break-words">
          {description}
        </p>
      )}
      {children}
    </div>
    {actions && (
      <div className="flex items-center justify-end gap-1.5 shrink-0 flex-wrap max-w-[55%]">
        {actions}
      </div>
    )}
  </div>
)

export const SettingsToolbar: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'px-4 py-2.5 bg-gray-50/80 dark:bg-gray-900/20',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsToolbarLabel: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <span
    className={cn(
      'text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider',
      className
    )}
    {...props}
  >
    {children}
  </span>
)

export const SettingsFieldRow: React.FC<SettingsFieldRowProps> = ({
  title,
  description,
  control,
  children,
  className,
  contentClassName,
  ...props
}) => (
  <div
    className={cn('flex items-center justify-between gap-4 py-2.5', className)}
    {...props}
  >
    <div className={cn('flex-1 min-w-0', contentClassName)}>
      <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">
        {title}
      </p>
      {description && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          {description}
        </p>
      )}
      {children}
    </div>
    {control && (
      <div className="shrink-0">
        {control}
      </div>
    )}
  </div>
)

export const SettingsControlGroup: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 shrink-0',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsCollapsibleArea: React.FC<SettingsCollapsibleAreaProps> = ({
  open,
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'grid transition-all duration-300 ease-in-out bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50',
      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      className
    )}
    {...props}
  >
    <div className="overflow-hidden">
      {children}
    </div>
  </div>
)

export const SettingsMetricGrid: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn('grid grid-cols-2 sm:grid-cols-4 gap-2', className)}
    {...props}
  >
    {children}
  </div>
)

export const SettingsMetricItem: React.FC<SettingsMetricItemProps> = ({
  label,
  value,
  valueClassName,
  className,
  ...props
}) => (
  <div
    className={cn(
      'min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 px-3 py-2',
      className
    )}
    {...props}
  >
    <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 break-words">
      {label}
    </p>
    <div className={cn('mt-1 text-[18px] font-semibold text-gray-900 dark:text-gray-100', valueClassName)}>
      {value}
    </div>
  </div>
)

export const SettingsNotice: React.FC<SettingsNoticeProps> = ({
  tone = 'neutral',
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed',
      tone === 'neutral' && 'border-gray-100 bg-white/90 text-gray-400 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-500',
      tone === 'warning' && 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
      tone === 'danger' && 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsSubsectionHeader: React.FC<SettingsSubsectionHeaderProps> = ({
  title,
  description,
  badges,
  actions,
  className,
  ...props
}) => (
  <div
    className={cn(
      'px-4 py-3 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/60 dark:bg-gray-900/20 flex items-start justify-between gap-3 min-w-0',
      className
    )}
    {...props}
  >
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="text-[12px] font-semibold tracking-wide text-gray-700 dark:text-gray-300">
          {title}
        </span>
        {badges}
      </div>
      {description && (
        <p className="text-[11.5px] text-gray-400 dark:text-gray-500 leading-relaxed break-words">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex shrink-0 items-center justify-end gap-2 flex-wrap max-w-[55%]">
        {actions}
      </div>
    )}
  </div>
)

export const SettingsLoadingState: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn('py-10 flex flex-col items-center justify-center gap-3 text-center', className)}
    {...props}
  >
    <div className="h-8 w-8 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center">
      <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-gray-500 dark:border-gray-700 dark:border-t-gray-300 animate-spin" />
    </div>
    <p className="text-[12px] font-medium text-gray-400 dark:text-gray-500">
      {children}
    </p>
  </div>
)

export const SettingsList: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/40 dark:bg-gray-900/30 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden',
      settingsScrollbarClassName,
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsListItem: React.FC<DivProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'group flex w-full min-w-0 items-start justify-between gap-4 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800/70 last:border-b-0',
      'hover:bg-white/70 dark:hover:bg-gray-800/40 transition-colors duration-150',
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const SettingsEmptyState: React.FC<SettingsEmptyStateProps> = ({
  icon,
  title,
  description,
  className,
  children,
  ...props
}) => (
  <div
    className={cn('py-10 flex flex-col items-center gap-2.5 text-center', className)}
    {...props}
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {icon}
    </div>
    <div className="space-y-0.5">
      <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">
        {title}
      </p>
      {description && (
        <p className="text-[11.5px] text-gray-400 dark:text-gray-500">
          {description}
        </p>
      )}
      {children}
    </div>
  </div>
)
