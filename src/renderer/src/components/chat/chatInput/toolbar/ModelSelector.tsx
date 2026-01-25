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
          {/* Animated background gradient on hover (selected state only) */}
          {selectedModel && (
            <div className="absolute inset-0 bg-linear-to-r from-emerald-100/0 via-emerald-100/50 to-teal-100/0 dark:from-emerald-900/0 dark:via-emerald-900/30 dark:to-teal-900/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}

          <span className="flex grow justify-center overflow-x-hidden relative z-10">
            {selectedModel ? (
              (() => {
                return selectedModel.model.type === 'vlm' ? (
                  <span className="flex items-center space-x-1.5 animate-in fade-in slide-in-from-left-1 duration-300">
                    <span className="truncate">{selectedModel.model.label}</span>
                    <i className="ri-eye-line text-emerald-500 dark:text-emerald-400 text-[10px] animate-in zoom-in duration-200 delay-100"></i>
                  </span>
                ) : (
                  <span className="truncate animate-in fade-in slide-in-from-left-1 duration-300">
                    {selectedModel.model.label}
                  </span>
                )
              })()
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Select Model</span>
            )}
          </span>

          <ChevronsUpDown
            className={cn(
              "flex opacity-50 w-4 h-4 transition-all duration-300 relative z-10",
              "group-hover:opacity-100",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full shadow-lg p-0 rounded-xl overflow-hidden border-transparent bg-white/10 backdrop-blur-xl dark:bg-gray-900"
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
                  className='scroll-smooth **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground'
                  heading={
                    <div className="flex rounded items-center gap-2 px-2 py-1.5 dark:bg-gray-800/80 -mx-2 sticky top-0 z-10 border-b border-black/5 dark:border-gray-800">
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
                        className={cn(
                          "pl-4 py-2.5 cursor-pointer rounded-xl",
                          "transition-all duration-200",
                          "dark:aria-selected:bg-emerald-900/20",
                          "aria-selected:text-emerald-700 dark:aria-selected:text-emerald-300",
                          "data-[selected=true]:bg-black/5"
                        )}
                        onSelect={(_) => {
                          onModelSelect({ accountId: group.account.id, modelId: m.id })
                        }}
                      >
                        <span className="truncate">{m.label}</span>
                        {m.type === 'vlm' && (
                          <i className="ri-eye-line text-emerald-500 dark:text-emerald-400 ml-2 text-xs animate-in zoom-in duration-200"></i>
                        )}
                        {(selectedModel
                          && selectedModel.model.id === m.id
                          && selectedModel.account.id === group.account.id) && (
                          <Check className={cn(
                            "ml-auto w-4 h-4 text-emerald-600 dark:text-emerald-400",
                            "animate-in zoom-in duration-200"
                          )} />
                        )}
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
