import BaseModelSelector from '@renderer/shared/components/model-selector/BaseModelSelector'
import { cn } from '@renderer/shared/lib/utils'
import type { ModelOption } from '@renderer/shared/config/modelTypes'
import React from 'react'

interface SettingsInlineModelSelectorProps {
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (ref: ModelRef) => void
  disabled?: boolean
  ariaLabel?: string
  triggerClassName?: string
}

const SettingsInlineModelSelector: React.FC<SettingsInlineModelSelectorProps> = ({
  disabled = false,
  ariaLabel = 'Select model',
  triggerClassName,
  ...props
}) => {
  return (
    <BaseModelSelector
      {...props}
      variant="settings"
      align="end"
      commandInputPlaceholder="Search model..."
      triggerRenderer={(selectedModel, isOpen) => (
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          title={ariaLabel}
          disabled={disabled}
          className={cn(
            'flex h-8 min-w-[180px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px]',
            'text-slate-700 shadow-xs transition-[background-color,border-color,color] duration-150',
            'hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40',
            'aria-expanded:border-slate-300 aria-expanded:bg-slate-100',
            'dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body) dark:shadow-none',
            'dark:hover:border-(--app-accent) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary)',
            'dark:aria-expanded:border-(--app-accent) dark:aria-expanded:bg-(--app-surface-hover) dark:aria-expanded:text-(--app-text-primary)',
            triggerClassName
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-200">
              {selectedModel ? selectedModel.model.label : 'Select model…'}
            </span>
            {selectedModel && (
              <span className="max-w-[120px] shrink-0 truncate text-[11px] text-gray-400 dark:text-gray-500">
                {selectedModel.definition.displayName}
              </span>
            )}
          </div>
          <i
            className={cn(
              'ri-arrow-down-s-line ml-1 text-slate-400 opacity-70 transition-transform duration-150 dark:text-(--app-text-muted)',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      )}
    />
  )
}

export default SettingsInlineModelSelector
