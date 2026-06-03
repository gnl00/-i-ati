import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import type { ModelOption } from '@renderer/store/appConfig'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import {
  getDefaultThinkingLevel,
  getRequestAdapterThinkingCapability,
  modelSupportsThinking
} from '@shared/plugins/requestAdapterThinking'
import { Check, ChevronsUpDown, Eye, Lightbulb } from 'lucide-react'
import React, { useMemo } from 'react'

interface ChatToolbarModelSelectorProps {
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  plugins?: PluginEntity[]
  selectedThinkingLevel?: ThinkingLevel
  collisionBoundary?: Element | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onModelSelect: (ref: ModelRef, thinkingLevel?: ThinkingLevel) => void
  triggerClassName?: string
}

type ModelSelectorGroup = {
  account: ProviderAccount
  definition: ProviderDefinition
  options: ModelOption[]
}

export type ChatToolbarModelSelection = {
  ref: ModelRef
  thinkingLevel?: ThinkingLevel
}

export const resolveChatToolbarModelSelection = (
  option: ModelOption,
  plugins: PluginEntity[] | undefined,
  requestedThinkingLevel?: ThinkingLevel
): ChatToolbarModelSelection => {
  const capability = getRequestAdapterThinkingCapability({
    plugins,
    pluginId: option.definition.adapterPluginId,
    baseUrl: option.account.apiUrl,
    modelId: option.model.id
  })
  const thinkingLevel = modelSupportsThinking(option.model, capability) && capability
    ? requestedThinkingLevel ?? getDefaultThinkingLevel(capability)
    : undefined

  return {
    ref: { accountId: option.account.id, modelId: option.model.id },
    thinkingLevel
  }
}

const ChatToolbarModelSelector: React.FC<ChatToolbarModelSelectorProps> = (props) => {
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, ModelSelectorGroup>()
    props.modelOptions.forEach(option => {
      const accountId = option.account.id
      if (!groups.has(accountId)) {
        groups.set(accountId, {
          account: option.account,
          definition: option.definition,
          options: []
        })
      }
      groups.get(accountId)!.options.push(option)
    })
    return Array.from(groups.values())
  }, [props.modelOptions])

  const getThinkingCapability = (option: ModelOption) => {
    const capability = getRequestAdapterThinkingCapability({
      plugins: props.plugins,
      pluginId: option.definition.adapterPluginId,
      baseUrl: option.account.apiUrl,
      modelId: option.model.id
    })
    return modelSupportsThinking(option.model, capability) ? capability : undefined
  }

  const handleModelSelect = (option: ModelOption, thinkingLevel?: ThinkingLevel) => {
    const selection = resolveChatToolbarModelSelection(option, props.plugins, thinkingLevel)
    props.onModelSelect(selection.ref, selection.thinkingLevel)
  }

  const isSelectedModel = (option: ModelOption) => {
    return props.selectedModel?.account.id === option.account.id
      && props.selectedModel?.model.id === option.model.id
  }

  const collisionProps = {
    avoidCollisions: true,
    collisionBoundary: props.collisionBoundary ?? undefined,
    collisionPadding: 8,
    sticky: 'always' as const
  }

  return (
    <DropdownMenu open={props.isOpen} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={props.isOpen}
          className={props.triggerClassName}
        >
          {props.selectedModel && (
            <div className="absolute inset-0 bg-linear-to-r from-emerald-100/0 via-emerald-100/50 to-teal-100/0 dark:from-emerald-900/0 dark:via-emerald-900/30 dark:to-teal-900/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}

          <span className="flex grow justify-center overflow-x-hidden relative z-10 min-w-0">
            {props.selectedModel ? (
              <span className="flex items-center gap-1.5 min-w-0 animate-in fade-in slide-in-from-left-1 duration-300">
                <span className="truncate">{props.selectedModel.model.label}</span>
                {(props.selectedModel.model.type === 'vlm' || props.selectedModel.model.type === 'mllm') && (
                  <Eye className="text-emerald-500 dark:text-emerald-400 h-3 w-3 shrink-0 animate-in zoom-in duration-200 delay-100" />
                )}
                {props.selectedThinkingLevel && getThinkingCapability(props.selectedModel) && (
                  <span className="shrink-0 rounded-md bg-slate-100/80 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                    {props.selectedThinkingLevel}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Select Model</span>
            )}
          </span>

          <ChevronsUpDown
            className={cn(
              'flex opacity-50 w-4 h-4 transition-all duration-300 relative z-10',
              'group-hover:opacity-100',
              props.isOpen && 'rotate-180'
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        {...collisionProps}
        className={cn(
          'w-80 overflow-visible rounded-xl p-0',
          'border border-slate-200/80 bg-white/95 text-slate-800 shadow-xl shadow-slate-900/10 backdrop-blur-xl',
          'dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-black/30'
        )}
        style={{
          maxWidth: 'min(calc(100vw - 2rem), var(--radix-dropdown-menu-content-available-width))'
        }}
      >
        <div
          className="overflow-y-auto p-1"
          style={{
            maxHeight: 'min(420px, var(--radix-dropdown-menu-content-available-height))'
          }}
        >
          {groupedOptions.length === 0 && (
            <DropdownMenuItem disabled className="rounded-lg text-xs text-slate-500">
              No model found.
            </DropdownMenuItem>
          )}

          {groupedOptions.map((group, groupIndex) => {
            const displayName = group.definition.displayName
            const showAccountLabel = group.account.label !== displayName

            return (
              <DropdownMenuGroup key={group.account.id}>
                {groupIndex > 0 && <DropdownMenuSeparator className="bg-slate-200/70 dark:bg-slate-800" />}
                <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <img
                    src={getProviderIcon(group.definition.iconKey || group.definition.id)}
                    alt={displayName}
                    className="h-4 w-4 object-contain opacity-70 dark:invert dark:brightness-90"
                  />
                  <span className="truncate">
                    {displayName}
                    {showAccountLabel && (
                      <span className="ml-1 text-[10px] font-medium text-slate-400">
                        {group.account.label}
                      </span>
                    )}
                  </span>
                </DropdownMenuLabel>

                {group.options.map(option => {
                  const capability = getThinkingCapability(option)
                  const isSelected = isSelectedModel(option)
                  const levelValue = isSelected && props.selectedThinkingLevel
                    ? props.selectedThinkingLevel
                    : capability
                      ? getDefaultThinkingLevel(capability)
                      : undefined

                  if (capability) {
                    return (
                      <DropdownMenuSub key={`${option.account.id}/${option.model.id}`}>
                        <DropdownMenuSubTrigger
                          className={cn(
                            'rounded-lg px-2 py-2 text-xs font-medium cursor-pointer',
                            'focus:bg-emerald-50 focus:text-emerald-800 data-[state=open]:bg-emerald-50 data-[state=open]:text-emerald-800',
                            'dark:focus:bg-emerald-950/30 dark:focus:text-emerald-200 dark:data-[state=open]:bg-emerald-950/30 dark:data-[state=open]:text-emerald-200'
                          )}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate">{option.model.label}</span>
                            {(option.model.type === 'vlm' || option.model.type === 'mllm') && (
                              <Eye className="h-3 w-3 shrink-0 text-emerald-500 dark:text-emerald-400" />
                            )}
                            <Lightbulb className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-300" />
                            {levelValue && (
                              <span className="rounded-md bg-slate-100/80 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                {levelValue}
                              </span>
                            )}
                          </span>
                          {isSelected && (
                            <Check className="ml-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={6}
                          alignOffset={-4}
                          {...collisionProps}
                          className={cn(
                            'min-w-36 rounded-xl border border-slate-200/80 bg-white/95 p-1 text-slate-800 shadow-xl shadow-slate-900/10 backdrop-blur-xl',
                            'dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-black/30'
                          )}
                          style={{
                            maxWidth: 'var(--radix-dropdown-menu-content-available-width)'
                          }}
                        >
                          <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Thinking level
                          </DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={levelValue}
                            onValueChange={(value) => handleModelSelect(option, value as ThinkingLevel)}
                          >
                            {capability.levels.map(level => (
                              <DropdownMenuRadioItem
                                key={level}
                                value={level}
                                onSelect={() => handleModelSelect(option, level)}
                                className={cn(
                                  'rounded-lg text-xs font-medium capitalize cursor-pointer',
                                  'focus:bg-emerald-50 focus:text-emerald-800 dark:focus:bg-emerald-950/30 dark:focus:text-emerald-200'
                                )}
                              >
                                {level}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )
                  }

                  return (
                    <DropdownMenuItem
                      key={`${option.account.id}/${option.model.id}`}
                      className={cn(
                        'rounded-lg px-2 py-2 text-xs font-medium cursor-pointer',
                        'focus:bg-emerald-50 focus:text-emerald-800 dark:focus:bg-emerald-950/30 dark:focus:text-emerald-200'
                      )}
                      onSelect={() => handleModelSelect(option)}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate">{option.model.label}</span>
                        {(option.model.type === 'vlm' || option.model.type === 'mllm') && (
                          <Eye className="h-3 w-3 shrink-0 text-emerald-500 dark:text-emerald-400" />
                        )}
                      </span>
                      {isSelected && (
                        <Check className="ml-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ChatToolbarModelSelector
