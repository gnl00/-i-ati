import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@renderer/shared/lib/utils'
import { ModelBadgeIcon } from './ModelBadgeIcon'

interface ModelBadgeProps {
  model: string
  provider?: string
  animate?: boolean
}

export const ModelBadge: React.FC<ModelBadgeProps> = ({
  model,
  provider,
  animate = false
}) => {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      id="model-badge"
      layout={!shouldReduceMotion}
      transition={{
        layout: {
          duration: shouldReduceMotion ? 0 : 0.26,
          ease: [0.22, 1, 0.36, 1]
        }
      }}
      className={cn(
        'mb-0.5 inline-flex max-w-full items-center gap-2.5 px-2.5 py-1.25 rounded-2xl',
        'select-none tracking-tight',
        'bg-linear-to-r from-slate-100/92 via-white/84 to-slate-100/88',
        'dark:bg-(--chat-surface-raised) dark:bg-none dark:ring-1 dark:ring-(--chat-border-subtle)',
        'shadow-[0_12px_30px_-22px_rgba(15,23,42,0.42)]',
        'backdrop-blur-md dark:shadow-none dark:backdrop-blur-none'
      )}
    >
      <ModelBadgeIcon provider={provider} model={model} animate={animate} />

      <span className="shrink-0 text-[10.5px] font-semibold text-slate-700 dark:text-(--chat-text-primary) uppercase">
        {model}
      </span>
    </motion.div>
  )
}
