import { cn } from '@renderer/shared/lib/utils'

export const providerConfigInputClassName = cn(
    'h-8 rounded-lg border-transparent bg-gray-100/80 text-[12.5px] shadow-inner',
    'ring-1 ring-inset ring-gray-200/80',
    'placeholder:text-gray-400/80',
    'transition-[background-color,box-shadow,color,border-color] duration-150',
    'hover:bg-gray-100 hover:ring-gray-300/80',
    'focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'dark:bg-gray-950/45 dark:ring-gray-800/80 dark:placeholder:text-gray-600',
    'dark:hover:bg-gray-950/60 dark:hover:ring-gray-700/90',
    'dark:focus-visible:border-gray-700 dark:focus-visible:ring-gray-600/80'
)

export const providerConfigSelectTriggerClassName = cn(
    'h-8 w-full rounded-lg border border-gray-200/85 bg-white/90 text-[12.5px] shadow-xs',
    'text-gray-800 transition-[background-color,border-color,box-shadow,color] duration-150',
    'hover:border-gray-300/90 hover:bg-gray-50/95 hover:shadow-sm',
    'focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0',
    'data-[state=open]:border-gray-400/80 data-[state=open]:bg-white data-[state=open]:shadow-sm',
    'disabled:cursor-not-allowed disabled:opacity-50',
    '[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-gray-400 [&>svg]:opacity-80',
    'dark:border-gray-800/90 dark:bg-gray-900/70 dark:text-gray-100 dark:shadow-none',
    'dark:hover:border-gray-700/90 dark:hover:bg-gray-900/90',
    'dark:focus-visible:border-gray-700 dark:focus-visible:ring-gray-600/80',
    'dark:data-[state=open]:border-gray-600/90 dark:data-[state=open]:bg-gray-900',
    'dark:[&>svg]:text-gray-500'
)

export const providerRevealButtonClassName = cn(
    'absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md',
    'text-gray-400 transition-[background-color,color,box-shadow,transform] duration-150',
    'hover:bg-gray-200/70 hover:text-gray-700',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400/70',
    'active:scale-[0.96]',
    'dark:text-gray-500 dark:hover:bg-gray-800/70 dark:hover:text-gray-200',
    'dark:focus-visible:ring-gray-600/80'
)

export const providerFieldLabelClassName = cn(
    'text-[10.5px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500'
)
