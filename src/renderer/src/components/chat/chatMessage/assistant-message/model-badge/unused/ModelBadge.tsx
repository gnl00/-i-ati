import React from 'react'
import { cn } from '@renderer/lib/utils'

interface ModelBadgeProps {
  model: string
  animate?: boolean
}

export const ModelBadge: React.FC<ModelBadgeProps> = ({ model, animate = false }) => {
  return (
    <div
      id="model-badge"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 mb-1.5 rounded-lg',
        'select-none font-medium text-[11px] tracking-wide',
        'bg-slate-50/80 dark:bg-slate-800/60',
        'border border-slate-200/60 dark:border-slate-700/50',
        'shadow-xs',
        'transition-all duration-300 ease-out',
        'backdrop-blur-xs',
        animate && 'animate-shine-infinite'
      )}
    >
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          'bg-slate-400 dark:bg-slate-500',
          'transition-all duration-1000',
          animate && 'animate-model-badge-dot'
        )}
      />
      <span className="text-slate-600 dark:text-slate-400">
        {model}
      </span>
    </div>
  )
}
