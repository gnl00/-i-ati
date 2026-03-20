import React from 'react'
import { cn } from '@renderer/lib/utils'

interface ModelBadgeV2Props {
  model: string
  animate?: boolean
}

export const ModelBadgeV2: React.FC<ModelBadgeV2Props> = ({ model, animate = false }) => {
  return (
    <div
      id="model-badge"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 mb-1 px-2 py-0.75 rounded-full',
        'select-none text-[10.5px] font-medium',
        'bg-slate-100/55 dark:bg-slate-800/35',
        'text-slate-500 dark:text-slate-400',
        'backdrop-blur-[2px]',
        'transition-colors duration-200'
      )}
    >
      <div
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400/90 dark:bg-slate-500/90',
          animate && 'animate-model-badge-dot'
        )}
      />
      <span className="truncate">
        {model}
      </span>
    </div>
  )
}
