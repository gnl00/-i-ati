import { Button } from '@renderer/shared/components/ui/button'
import BaseModelSelector from '@renderer/shared/components/model-selector/BaseModelSelector'
import { cn } from '@renderer/shared/lib/utils'
import type { ModelOption } from '@renderer/shared/config/modelTypes'
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
      popoverContentClassName="border border-border bg-popover/95 text-popover-foreground backdrop-blur-xl shadow-xs"
      commandClassName="bg-transparent"
      commandInputPlaceholder="Search models..."
      commandListClassName="max-h-64"
      itemClassName={cn(
        'aria-selected:bg-slate-100/80 aria-selected:text-slate-900',
        'data-[selected=true]:bg-slate-100/80 data-[selected=true]:text-slate-900',
        'dark:aria-selected:bg-slate-800/70 dark:aria-selected:text-slate-100',
        'dark:data-[selected=true]:bg-slate-800/70 dark:data-[selected=true]:text-slate-100'
      )}
      selectedIconClassName="text-slate-700 dark:text-slate-200"
      triggerRenderer={(selectedModel) => (
        <Button
          id="assistant-model"
          variant="outline"
          role="combobox"
          className={cn(
            'w-full h-10 justify-between group rounded-xl',
            'border border-border bg-background text-foreground',
            'outline-hidden focus:outline-hidden focus-visible:outline-hidden',
            'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'hover:border-foreground/20 hover:bg-background',
            'shadow-xs transition-[background-color,border-color,box-shadow] duration-200'
          )}
        >
          <span className={cn('truncate', selectedModel ? 'text-foreground' : 'text-muted-foreground')}>
            {selectedModel?.model.label ?? 'Select a model...'}
          </span>
          <i className="ri-arrow-down-s-line ml-2 text-muted-foreground opacity-55 transition-opacity duration-200 group-hover:opacity-100" />
        </Button>
      )}
    />
  )
}

export default DrawerFieldModelSelector
