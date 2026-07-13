import { cn } from '@renderer/shared/lib/utils'

/**
 * App-wide button style tokens. Shared across features so no feature needs to
 * reach into another feature's internals for consistent button styling.
 */

export const primaryButtonClassName = cn(
  'h-7 px-3 flex items-center gap-1.5 rounded-lg',
  'text-[11px] font-medium',
  'bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white',
  'text-white dark:text-gray-900',
  'active:scale-[0.97] transition-all duration-150',
  'shadow-sm shadow-gray-900/10',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const secondaryButtonClassName = cn(
  'h-7 px-2.5 flex items-center gap-1.5 rounded-md',
  'text-[11px] font-medium',
  'text-gray-500 dark:text-gray-400',
  'hover:text-gray-700 dark:hover:text-gray-200',
  'hover:bg-gray-100 dark:hover:bg-gray-700/50',
  'active:scale-[0.97] transition-all duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const outlineButtonClassName = cn(
  'h-7 px-3 flex items-center gap-1.5 rounded-md',
  'text-[11px] font-medium',
  'text-gray-600 dark:text-gray-300',
  'border border-gray-200 dark:border-gray-700',
  'hover:bg-gray-100 dark:hover:bg-gray-700/50',
  'active:scale-[0.97] transition-all duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const iconButtonClassName = cn(
  'h-8 w-8 flex items-center justify-center rounded-lg',
  'border border-gray-200 dark:border-gray-700',
  'text-gray-500 dark:text-gray-300',
  'hover:bg-white dark:hover:bg-gray-800',
  'transition-colors duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)

export const dangerButtonClassName = cn(
  'h-7 px-3 flex items-center gap-1.5 rounded-md',
  'text-[11px] font-medium',
  'text-rose-600 dark:text-rose-300',
  'border border-rose-200 dark:border-rose-900/60',
  'hover:bg-rose-50 dark:hover:bg-rose-950/40',
  'active:scale-[0.97] transition-all duration-150',
  'disabled:opacity-40 disabled:pointer-events-none'
)
