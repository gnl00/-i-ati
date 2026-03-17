import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import type { ModelOption } from '@renderer/store/appConfig'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import { Check } from 'lucide-react'
import React, { useMemo } from 'react'

type ModelSelectorGroup = {
  account: ProviderAccount
  definition: ProviderDefinition
  models: AccountModel[]
}

interface BaseModelSelectorProps {
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (ref: ModelRef) => void
  triggerRenderer: (selectedModel: ModelOption | undefined, isOpen: boolean) => React.ReactNode
  popoverContentClassName?: string
  commandClassName?: string
  commandInputPlaceholder?: string
  commandListClassName?: string
  itemClassName?: string
  selectedIconClassName?: string
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  portalContainer?: HTMLElement | null
}

const BaseModelSelector: React.FC<BaseModelSelectorProps> = ({
  selectedModel,
  modelOptions,
  isOpen,
  onOpenChange,
  onModelSelect,
  triggerRenderer,
  popoverContentClassName,
  commandClassName,
  commandInputPlaceholder,
  commandListClassName,
  itemClassName,
  selectedIconClassName,
  align = 'start',
  sideOffset = 8,
  portalContainer
}) => {
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, ModelSelectorGroup>()
    modelOptions.forEach(option => {
      const accountId = option.account.id
      if (!groups.has(accountId)) {
        groups.set(accountId, {
          account: option.account,
          definition: option.definition,
          models: []
        })
      }
      groups.get(accountId)!.models.push(option.model)
    })
    return Array.from(groups.values())
  }, [modelOptions])

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {triggerRenderer(selectedModel, isOpen)}
      </PopoverTrigger>
      <PopoverContent
        portalContainer={portalContainer}
        className={cn(
          'w-full shadow-lg p-0 rounded-xl overflow-hidden border-transparent bg-white/10 backdrop-blur-xl dark:bg-gray-900',
          popoverContentClassName
        )}
        sideOffset={sideOffset}
        align={align}
      >
        <Command className={cn('rounded-xl bg-transparent dark:bg-gray-900', commandClassName)}>
          <CommandInput placeholder={commandInputPlaceholder ?? 'Search model'} className="h-auto" />
          <CommandList className={commandListClassName}>
            <CommandEmpty>No model found.</CommandEmpty>
            {groupedOptions.map(group => {
              if (group.models.length === 0) {
                return null
              }
              const displayName = group.definition.displayName
              const showAccountLabel = group.account.label !== displayName
              return (
                <CommandGroup
                  key={group.account.id}
                  value={group.account.label}
                  className='scroll-smooth **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground'
                  heading={
                    <div className="flex rounded items-center gap-2 px-2 py-1.5 dark:bg-gray-800/80 -mx-2 sticky top-0 z-10 border-b border-black/5 dark:border-gray-800">
                      <img
                        src={getProviderIcon(group.definition.iconKey || group.definition.id)}
                        alt={displayName}
                        className="w-4 h-4 object-contain dark:invert dark:brightness-90 opacity-70"
                      />
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
                        {displayName}
                        {showAccountLabel && (
                          <span className="text-[10px] text-gray-400 ml-1">
                            {group.account.label}
                          </span>
                        )}
                      </span>
                    </div>
                  }
                >
                  <div className="pt-1">
                    {group.models.map(model => (
                      <CommandItem
                        key={`${group.account.id}/${model.id}`}
                        value={`${group.account.id}/${model.id}`}
                        className={cn(
                          'pl-4 py-2.5 cursor-pointer rounded-xl transition-all duration-200 data-[selected=true]:bg-black/5',
                          itemClassName
                        )}
                        onSelect={() => {
                          onModelSelect({ accountId: group.account.id, modelId: model.id })
                        }}
                      >
                        <span className="truncate">{model.label}</span>
                        {(model.type === 'vlm' || model.type === 'mllm') && (
                          <i className="ri-eye-line text-emerald-500 dark:text-emerald-400 ml-2 text-xs animate-in zoom-in duration-200"></i>
                        )}
                        {selectedModel
                          && selectedModel.model.id === model.id
                          && selectedModel.account.id === group.account.id && (
                          <Check className={cn('ml-auto h-4 w-4', selectedIconClassName)} />
                        )}
                      </CommandItem>
                    ))}
                  </div>
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default BaseModelSelector
