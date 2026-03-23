import React from 'react'
import { cn } from '@renderer/lib/utils'
import { ModelBadgeNextIcon } from './ModelBadgeNextIcon'

interface ModelBadgeNextProps {
  model: string
  provider?: string
  animate?: boolean
}

export const ModelBadgeNext: React.FC<ModelBadgeNextProps> = ({ model, provider, animate = false }) => {
  return (
    <div
      id="model-badge"
      className={cn(
        'inline-flex max-w-full items-center gap-2.5 mb-2 px-2.5 py-1.25 rounded-2xl',
        'select-none tracking-tight',
        'bg-linear-to-r from-slate-100/92 via-white/84 to-slate-100/88',
        'dark:from-slate-900/64 dark:via-slate-900/48 dark:to-slate-900/60',
        'shadow-[0_12px_30px_-22px_rgba(15,23,42,0.42)]',
        'backdrop-blur-md'
      )}
    >
      <ModelBadgeNextIcon provider={provider} model={model} animate={animate} />

      <span className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-100 uppercase">
        {model}
      </span>
    </div>
  )
}
