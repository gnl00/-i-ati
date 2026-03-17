import BaseModelSelector from '@renderer/components/shared/model-selector/BaseModelSelector'
import type { ModelOption } from '@renderer/store/appConfig'
import React from 'react'

interface SettingsInlineModelSelectorProps {
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (ref: ModelRef) => void
  disabled?: boolean
}

const SettingsInlineModelSelector: React.FC<SettingsInlineModelSelectorProps> = ({
  disabled = false,
  ...props
}) => {
  return (
    <BaseModelSelector
      {...props}
      align="end"
      popoverContentClassName="w-fit bg-white/50 backdrop-blur-lg"
      commandClassName="rounded-3xl bg-transparent"
      commandInputPlaceholder="Search model..."
      commandListClassName="max-h-[300px] overflow-y-auto"
      itemClassName="cursor-pointer rounded-xl"
      triggerRenderer={(selectedModel, isOpen) => (
        <button
          role="combobox"
          aria-expanded={isOpen}
          disabled={disabled}
          className="h-8 px-3 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[12px] hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150 min-w-[180px] justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            <span className="truncate font-medium text-gray-700 dark:text-gray-200">
              {selectedModel ? selectedModel.model.label : 'Select model…'}
            </span>
            {selectedModel && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                {selectedModel.definition.displayName}
              </span>
            )}
          </div>
          <i className="ri-arrow-down-s-line ml-1 text-gray-400 opacity-70" />
        </button>
      )}
    />
  )
}

export default SettingsInlineModelSelector
