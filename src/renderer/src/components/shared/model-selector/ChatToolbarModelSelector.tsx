import { Button } from '@renderer/components/ui/button'
import BaseModelSelector from '@renderer/components/shared/model-selector/BaseModelSelector'
import { cn } from '@renderer/lib/utils'
import type { ModelOption } from '@renderer/store/appConfig'
import { ChevronsUpDown } from 'lucide-react'
import React from 'react'

interface ChatToolbarModelSelectorProps {
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (ref: ModelRef) => void
  triggerClassName?: string
}

const ChatToolbarModelSelector: React.FC<ChatToolbarModelSelectorProps> = (props) => {
  return (
    <BaseModelSelector
      {...props}
      popoverContentClassName="w-full"
      itemClassName={cn(
        'dark:aria-selected:bg-emerald-900/20',
        'aria-selected:text-emerald-700 dark:aria-selected:text-emerald-300'
      )}
      selectedIconClassName="text-emerald-600 dark:text-emerald-400"
      triggerRenderer={(selectedModel, isOpen) => (
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className={props.triggerClassName}
        >
          {selectedModel && (
            <div className="absolute inset-0 bg-linear-to-r from-emerald-100/0 via-emerald-100/50 to-teal-100/0 dark:from-emerald-900/0 dark:via-emerald-900/30 dark:to-teal-900/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}

          <span className="flex grow justify-center overflow-x-hidden relative z-10">
            {selectedModel ? (
              selectedModel.model.type === 'vlm' || selectedModel.model.type === 'mllm' ? (
                <span className="flex items-center space-x-1.5 animate-in fade-in slide-in-from-left-1 duration-300">
                  <span className="truncate">{selectedModel.model.label}</span>
                  <i className="ri-eye-line text-emerald-500 dark:text-emerald-400 text-[10px] animate-in zoom-in duration-200 delay-100"></i>
                </span>
              ) : (
                <span className="truncate animate-in fade-in slide-in-from-left-1 duration-300">
                  {selectedModel.model.label}
                </span>
              )
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Select Model</span>
            )}
          </span>

          <ChevronsUpDown
            className={cn(
              'flex opacity-50 w-4 h-4 transition-all duration-300 relative z-10',
              'group-hover:opacity-100',
              isOpen && 'rotate-180'
            )}
          />
        </Button>
      )}
    />
  )
}

export default ChatToolbarModelSelector
