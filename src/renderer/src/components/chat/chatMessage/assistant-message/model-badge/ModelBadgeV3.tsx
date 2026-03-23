import React from 'react'
import { Bot } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface ModelBadgeV3Props {
  model: string
  animate?: boolean
}

export const ModelBadgeV3: React.FC<ModelBadgeV3Props> = ({ model, animate = false }) => {
  return (
    <div
      id="model-badge"
      className={cn(
        'inline-flex max-w-full items-center gap-2 mb-2 px-2.5 py-1 rounded-xl',
        'select-none text-[11px] font-semibold tracking-tight',
        'bg-slate-50/84 dark:bg-slate-900/42',
        'text-slate-700 dark:text-slate-200',
        'border border-slate-200/35 dark:border-white/6',
        'shadow-[0_8px_22px_-20px_rgba(15,23,42,0.34)]',
        'backdrop-blur-sm',
        'transition-colors duration-200'
      )}
    >
      <span
        className={cn(
          'inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md',
          'bg-slate-200/48 text-slate-600 dark:bg-white/5 dark:text-slate-300',
          'ring-1 ring-slate-300/28 dark:ring-white/5'
        )}
      >
        <Bot className={cn('h-3 w-3', animate && 'animate-model-badge-dot')} />
      </span>

      <span className="truncate">
        {model}
      </span>
    </div>
  )
}
