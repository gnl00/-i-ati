import { Button } from '@renderer/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import { Check, ChevronsUpDown } from 'lucide-react'
import React from 'react'

interface ModelSelectorProps {
  selectedModel: IModel | undefined
  models: IModel[]
  providers: IProvider[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (model: IModel, providerName: string) => void
  triggerClassName?: string
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  models,
  providers,
  isOpen,
  onOpenChange,
  onModelSelect,
  triggerClassName
}) => {
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
                return selectedModel.type === 'vlm' ? (
                  <span className="flex items-center space-x-1.5">
                    <span>{selectedModel.name}</span>
                    <i className="ri-eye-line text-green-500 text-[10px]"></i>
                  </span>
                ) : <span>{selectedModel.name}</span>
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
            {(models.findIndex(fm => fm.enable === true) != -1) && <CommandEmpty>Oops...NotFound</CommandEmpty>}
            {providers.map((p) => p.models.length > 0 && p.models.findIndex(m => m.enable) !== -1 && (
              <CommandGroup
                key={p.name}
                value={p.name}
                className='scroll-smooth [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'
                heading={
                  <div className="flex items-center gap-2 px-2 py-1.5 dark:bg-gray-800/80 -mx-2 sticky top-0 z-10 border-b border-black/5 dark:border-gray-800">
                    <img
                      src={getProviderIcon(p.name)}
                      alt={p.name}
                      className="w-4 h-4 object-contain dark:invert dark:brightness-90 opacity-70"
                    />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
                      {p.name}
                    </span>
                  </div>
                }
              >
                <div className="pt-1">
                  {
                    p.models.map((m) => m.enable && (
                      <CommandItem
                        key={m.provider + '/' + m.value}
                        value={m.provider + '/' + m.value}
                        className="aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-700 dark:aria-selected:text-blue-300 pl-4 py-2"
                        onSelect={(_) => {
                          onModelSelect(m, p.name)
                        }}
                      >
                        <span className="truncate">{m.name}</span>
                        {m.type === 'vlm' && <i className="ri-eye-line text-green-500 ml-2 text-xs"></i>}
                        {(selectedModel && selectedModel.value === m.value && selectedModel.provider === p.name) &&
                          <Check className={cn("ml-auto w-4 h-4 text-blue-500")} />
                        }
                      </CommandItem>
                    ))
                  }
                </div>
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default ModelSelector
