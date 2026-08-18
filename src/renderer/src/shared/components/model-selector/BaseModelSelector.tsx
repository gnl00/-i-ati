import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/shared/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/shared/components/ui/popover'
import { ProviderIcon } from '@renderer/shared/components/ProviderIcon'
import { cn } from '@renderer/shared/lib/utils'
import type { ModelOption } from '@renderer/shared/config/modelTypes'
import { Check, Eye } from 'lucide-react'
import React, { useMemo } from 'react'

type ModelSelectorGroup = {
  account: ProviderAccount
  definition: ProviderDefinition
  models: AccountModel[]
}

export type BaseModelSelectorVariant = 'default' | 'settings'

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
  variant?: BaseModelSelectorVariant
}

const defaultSelectorClassNames = {
  content: 'w-full rounded-xl border-transparent bg-white/10 shadow-lg backdrop-blur-xl dark:bg-gray-900',
  command: 'rounded-xl bg-transparent dark:bg-gray-900',
  input: 'h-auto',
  list: undefined,
  empty: undefined,
  group: 'scroll-smooth **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
  heading: 'sticky top-0 z-10 -mx-2 flex items-center gap-2 rounded border-b border-black/5 px-2 py-1.5 dark:border-gray-800 dark:bg-gray-800/80',
  providerName: 'text-xs font-semibold tracking-tight text-gray-700 dark:text-gray-300',
  accountName: 'ml-1 text-[10px] text-gray-400',
  items: 'pt-1',
  item: 'cursor-pointer rounded-xl py-2.5 pl-4 transition-all duration-200 data-[selected=true]:bg-black/5',
  currentItem: undefined,
  modelName: 'truncate',
  visionIcon: 'ml-2 h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400',
  selectedIcon: 'ml-auto h-4 w-4'
} as const

export const settingsModelSelectorClassNames = {
  content: cn(
    'w-[min(380px,calc(100vw-2rem))] rounded-[10px] border border-slate-200/80 bg-white p-0 text-slate-700',
    'shadow-[0_18px_52px_rgba(15,23,42,0.16),0_1px_0_rgba(255,255,255,0.85)_inset] backdrop-blur-none',
    'dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body)',
    'dark:shadow-[0_20px_56px_rgba(0,0,0,0.42),0_1px_0_rgba(255,255,255,0.035)_inset] dark:backdrop-blur-none'
  ),
  command: cn(
    'rounded-[10px] bg-transparent dark:bg-transparent',
    '[&_[cmdk-input-wrapper]]:mx-2 [&_[cmdk-input-wrapper]]:mt-2 [&_[cmdk-input-wrapper]]:mb-1',
    '[&_[cmdk-input-wrapper]]:h-9 [&_[cmdk-input-wrapper]]:rounded-lg [&_[cmdk-input-wrapper]]:border',
    '[&_[cmdk-input-wrapper]]:border-slate-200 [&_[cmdk-input-wrapper]]:bg-slate-50/85 [&_[cmdk-input-wrapper]]:px-2.5',
    '[&_[cmdk-input-wrapper]]:transition-[background-color,border-color,box-shadow] [&_[cmdk-input-wrapper]]:duration-150',
    '[&_[cmdk-input-wrapper]:focus-within]:border-slate-300 [&_[cmdk-input-wrapper]:focus-within]:bg-white [&_[cmdk-input-wrapper]:focus-within]:shadow-xs',
    'dark:[&_[cmdk-input-wrapper]]:border-(--app-border-standard) dark:[&_[cmdk-input-wrapper]]:bg-(--app-surface-inset)',
    'dark:[&_[cmdk-input-wrapper]:focus-within]:border-(--app-accent) dark:[&_[cmdk-input-wrapper]:focus-within]:bg-(--app-surface-inset)',
    'dark:[&_[cmdk-input-wrapper]:focus-within]:shadow-none',
    '[&_[cmdk-input-wrapper]_svg]:mr-2 [&_[cmdk-input-wrapper]_svg]:h-3.5 [&_[cmdk-input-wrapper]_svg]:w-3.5',
    '[&_[cmdk-input-wrapper]_svg]:text-slate-400 [&_[cmdk-input-wrapper]_svg]:opacity-100',
    'dark:[&_[cmdk-input-wrapper]_svg]:text-(--app-text-muted)'
  ),
  input: cn(
    'h-8 py-0 text-[12px] font-medium text-slate-800 placeholder:text-slate-400',
    'dark:text-(--app-text-primary) dark:placeholder:text-(--app-text-muted)'
  ),
  list: 'max-h-[300px] px-1 pb-1 [scrollbar-width:thin]',
  empty: 'py-8 text-[12px] text-slate-400 dark:text-(--app-text-muted)',
  group: cn(
    'scroll-smooth p-0 pb-1',
    '**:[[cmdk-group-heading]]:sticky **:[[cmdk-group-heading]]:top-0 **:[[cmdk-group-heading]]:z-10',
    '**:[[cmdk-group-heading]]:p-0 **:[[cmdk-group-heading]]:font-medium'
  ),
  heading: cn(
    'flex items-center gap-2 border-b border-slate-200/70 bg-white/96 px-2.5 py-2',
    'dark:border-(--app-border-subtle) dark:bg-(--app-surface-raised)'
  ),
  providerName: 'min-w-0 truncate text-[11px] font-semibold tracking-tight text-slate-600 dark:text-(--app-text-secondary)',
  accountName: 'ml-1 text-[10px] font-medium text-slate-400 dark:text-(--app-text-muted)',
  items: undefined,
  item: cn(
    'mx-1.5 my-0.5 h-9 cursor-pointer rounded-lg px-2.5 py-0 text-[12.5px] font-medium text-slate-700',
    'transition-colors duration-150 data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-950',
    'dark:text-(--app-text-body) dark:data-[selected=true]:bg-(--app-surface-hover) dark:data-[selected=true]:text-(--app-text-primary)'
  ),
  currentItem: cn(
    'bg-slate-100/75 text-slate-950',
    'dark:bg-(--app-surface-hover) dark:text-(--app-text-primary)'
  ),
  modelName: 'min-w-0 truncate',
  visionIcon: 'ml-1.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-(--app-text-muted)',
  selectedIcon: 'ml-auto h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-(--app-accent-strong)'
} as const

export const isModelSelectorOptionSelected = (
  selectedModel: ModelOption | undefined,
  accountId: string,
  modelId: string
): boolean => {
  return selectedModel?.account.id === accountId && selectedModel.model.id === modelId
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
  portalContainer,
  variant = 'default'
}) => {
  const classNames = variant === 'settings'
    ? settingsModelSelectorClassNames
    : defaultSelectorClassNames

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
        data-model-selector-variant={variant}
        className={cn(
          'overflow-hidden p-0',
          classNames.content,
          popoverContentClassName
        )}
        sideOffset={sideOffset}
        align={align}
      >
        <Command className={cn(classNames.command, commandClassName)}>
          <CommandInput
            placeholder={commandInputPlaceholder ?? 'Search model'}
            className={classNames.input}
          />
          <CommandList className={cn(classNames.list, commandListClassName)}>
            <CommandEmpty className={classNames.empty}>No model found.</CommandEmpty>
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
                  className={classNames.group}
                  heading={
                    <div className={classNames.heading}>
                      <ProviderIcon
                        provider={group.definition.iconKey || group.definition.id}
                        alt={displayName}
                        className="h-4 w-4 shrink-0 object-contain"
                      />
                      <span className={classNames.providerName}>
                        {displayName}
                        {showAccountLabel && (
                          <span className={classNames.accountName}>
                            {group.account.label}
                          </span>
                        )}
                      </span>
                    </div>
                  }
                >
                  <div className={classNames.items}>
                    {group.models.map(model => {
                      const isSelected = isModelSelectorOptionSelected(
                        selectedModel,
                        group.account.id,
                        model.id
                      )

                      return (
                        <CommandItem
                          key={`${group.account.id}/${model.id}`}
                          value={`${group.account.id}/${model.id}`}
                          data-current={isSelected ? 'true' : undefined}
                          className={cn(
                            classNames.item,
                            isSelected && classNames.currentItem,
                            itemClassName
                          )}
                          onSelect={() => {
                            onModelSelect({ accountId: group.account.id, modelId: model.id })
                          }}
                        >
                          <span className={classNames.modelName} title={model.label}>{model.label}</span>
                          {(model.type === 'vlm' || model.type === 'mllm') && (
                            variant === 'settings' ? (
                              <Eye aria-label="Vision capable" className={classNames.visionIcon} />
                            ) : (
                              <i className="ri-eye-line text-emerald-500 dark:text-emerald-400 ml-2 text-xs animate-in zoom-in duration-200" />
                            )
                          )}
                          {isSelected && (
                            <Check className={cn(classNames.selectedIcon, selectedIconClassName)} />
                          )}
                        </CommandItem>
                      )
                    })}
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
