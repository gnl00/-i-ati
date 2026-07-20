import * as React from 'react'
import { DrawerHeader, DrawerTitle, DrawerDescription } from './drawer'
import { cn } from '@renderer/shared/lib/utils'

interface DrawerHeaderBarProps {
  /** Primary heading text. */
  title: React.ReactNode
  /** Optional secondary line under the title. */
  description?: React.ReactNode
  /** Optional icon rendered in a rounded box to the left of the text. */
  icon?: React.ReactNode
  /** Optional pill/eyebrow rendered above the title (e.g. a status badge). */
  eyebrow?: React.ReactNode
  /** Optional chip rendered inline, trailing the description. */
  badge?: React.ReactNode
  /** Optional compact context chip rendered after the description. */
  context?: React.ReactNode
  /** Optional right-aligned slot for actions (e.g. a close button). */
  actions?: React.ReactNode
  /**
   * `default` — compact header (15px title). Used by all current drawers.
   * `lg` — larger centered header (22px title, max-w-3xl) for spacious,
   *   form-heavy drawers that want more presence. Currently unused.
   * @default 'default'
   */
  size?: 'default' | 'lg'
  className?: string
}

/**
 * Canonical drawer header shared across every Drawer in the app.
 * Owns palette, type scale, padding, and the bottom divider so headers
 * stay consistent. Compose the optional slots for per-drawer needs.
 */
const DrawerHeaderBar: React.FC<DrawerHeaderBarProps> = ({
  title,
  description,
  icon,
  eyebrow,
  badge,
  context,
  actions,
  size = 'default',
  className
}) => {
  const isLarge = size === 'lg'

  const textColumn = (
    <div className="min-w-0 flex-1">
      {eyebrow && <div className="mb-2">{eyebrow}</div>}
      <DrawerTitle
        className={cn(
          'font-semibold tracking-tight text-gray-900 dark:text-gray-100',
          isLarge ? 'text-[22px]' : 'text-[15px]'
        )}
      >
        {title}
      </DrawerTitle>
      {(description || context || badge) && (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {description ? (
            <DrawerDescription
              className={cn(
                'min-w-0 text-gray-500 dark:text-gray-400',
                isLarge ? 'text-sm leading-relaxed' : 'truncate text-[12px] leading-4'
              )}
            >
              {description}
            </DrawerDescription>
          ) : null}
          {context ? (
            <span
              className={cn(
                'inline-flex h-5 max-w-full min-w-0 items-center rounded-md border px-2',
                'border-gray-200/80 bg-gray-100/80 text-[10.5px] font-medium text-gray-600 shadow-inner',
                'dark:border-gray-800 dark:bg-gray-950/45 dark:text-gray-400'
              )}
            >
              <span className="sr-only">Context: </span>
              <span className="truncate">{context}</span>
            </span>
          ) : null}
          {badge}
        </div>
      )}
    </div>
  )

  return (
    <DrawerHeader
      className={cn(
        'space-y-0 border-b border-gray-200/70 text-left dark:border-gray-800/80',
        isLarge ? 'px-4 pt-4 pb-3.5 md:px-6' : 'px-5 pt-4 pb-3.5',
        className
      )}
    >
      <div className={cn(isLarge && 'mx-auto w-full max-w-3xl')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon && (
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-inner',
                  'border-gray-200/80 bg-gray-50 text-gray-600',
                  'dark:border-gray-800 dark:bg-gray-950/45 dark:text-gray-300'
                )}
                aria-hidden="true"
              >
                {icon}
              </div>
            )}
            {textColumn}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      </div>
    </DrawerHeader>
  )
}

export default DrawerHeaderBar
