import { Button } from '@renderer/components/ui/button'
import BaseModelSelector from '@renderer/components/shared/model-selector/BaseModelSelector'
import { cn } from '@renderer/lib/utils'
import type { ModelOption } from '@renderer/store/appConfig'
import React from 'react'

interface DrawerFieldModelSelectorProps {
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (ref: ModelRef) => void
  portalContainer?: HTMLElement | null
}

const DrawerFieldModelSelector: React.FC<DrawerFieldModelSelectorProps> = ({
  portalContainer,
  ...props
}) => {
  return (
    <BaseModelSelector
      {...props}
      portalContainer={portalContainer}
      popoverContentClassName="border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl shadow-[0_20px_48px_-28px_rgba(15,23,42,0.5)]"
      commandClassName="bg-transparent dark:bg-slate-900"
      commandInputPlaceholder="Search models..."
      commandListClassName="max-h-64"
      itemClassName={cn(
        'dark:aria-selected:bg-sky-900/20',
        'aria-selected:text-sky-700 dark:aria-selected:text-sky-300'
      )}
      selectedIconClassName="text-sky-600 dark:text-sky-400"
      triggerRenderer={(selectedModel) => (
        <Button
          id="assistant-model"
          variant="outline"
          role="combobox"
          className={cn(
            'w-full h-10 justify-between group rounded-xl',
            'bg-slate-50/90 dark:bg-slate-900/60',
            'border border-slate-200/90 dark:border-slate-800',
            'outline-hidden focus:outline-hidden focus-visible:outline-hidden',
            'ring-0 focus:ring-0 focus-visible:ring-0',
            'ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0',
            'focus:border-sky-400/70 dark:focus:border-sky-500/60',
            'hover:bg-slate-50 dark:hover:bg-slate-900/60',
            'hover:border-slate-300/80 dark:hover:border-slate-700/80',
            'shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-all duration-200'
          )}
        >
          <span className={cn('truncate', selectedModel ? 'text-slate-800 dark:text-slate-100' : 'text-muted-foreground')}>
            {selectedModel?.model.label ?? 'Select a model...'}
          </span>
          <i className="ri-arrow-down-s-line ml-2 text-slate-400 opacity-50 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-[1px]" />
        </Button>
      )}
    />
  )
}

export default DrawerFieldModelSelector
