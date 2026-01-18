import { Button } from '@renderer/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import { Check, ChevronsUpDown } from 'lucide-react'
import React, { useMemo } from 'react'
import type { ModelOption } from '@renderer/store/appConfig'

interface ModelSelectorProps {
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (ref: ModelRef) => void
  triggerClassName?: string
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  modelOptions,
  isOpen,
  onOpenChange,
  onModelSelect,
  triggerClassName
}) => {
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, { account: ProviderAccount; definition?: ProviderDefinition; models: AccountModel[] }>()
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
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className={triggerClassName}
        >
          <span className="flex flex-grow justify-center overflow-x-hidden">
            {selectedModel ? (
              (() => {
                return selectedModel.model.type === 'vlm' ? (
                  <span className="flex items-center space-x-1.5">
                    <span>{selectedModel.model.label}</span>
                    <i className="ri-eye-line text-green-500 text-[10px]"></i>
                  </span>
                ) : <span>{selectedModel.model.label}</span>
              })()) : ("Select Model")}
          </span>
          <ChevronsUpDown className="flex opacity-50 w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full shadow-lg p-0 rounded-xl overflow-hidden bg-white/10 backdrop-blur-xl dark:bg-gray-900"
        sideOffset={8}
        align="start"
      >
        <Command className='rounded-xl bg-transparent dark:bg-gray-900'>
          <CommandInput placeholder="Search model" className="h-auto" />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {groupedOptions.map((group) => {
              if (group.models.length === 0) {
                return null
              }
              const displayName = group.definition?.displayName || group.account.label
              const showAccountLabel = group.definition && group.account.label !== displayName
              return (
                <CommandGroup
                  key={group.account.id}
                  value={group.account.label}
                  className='scroll-smooth [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'
                  heading={
                    <div className="flex items-center gap-2 px-2 py-1.5 dark:bg-gray-800/80 -mx-2 sticky top-0 z-10 border-b border-black/5 dark:border-gray-800">
                      <img
                        src={getProviderIcon(group.definition?.iconKey || group.definition?.id || group.account.providerId)}
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
                  {
                    group.models.map((m) => m.enabled !== false && (
                      <CommandItem
                        key={`${group.account.id}/${m.id}`}
                        value={`${group.account.id}/${m.id}`}
                        className="aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-700 dark:aria-selected:text-blue-300 pl-4 py-2"
                        onSelect={(_) => {
                          onModelSelect({ accountId: group.account.id, modelId: m.id })
                        }}
                      >
                        <span className="truncate">{m.label}</span>
                        {m.type === 'vlm' && <i className="ri-eye-line text-green-500 ml-2 text-xs"></i>}
                        {(selectedModel
                          && selectedModel.model.id === m.id
                          && selectedModel.account.id === group.account.id) &&
                          <Check className={cn("ml-auto w-4 h-4 text-blue-500")} />
                        }
                      </CommandItem>
                    ))
                  }
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

export default ModelSelector
