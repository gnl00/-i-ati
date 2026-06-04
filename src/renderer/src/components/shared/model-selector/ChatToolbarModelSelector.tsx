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
import {
  filterModelSelectorGroups,
  groupModelSelectorOptions,
  resolveChatToolbarModelSelection
} from './ChatToolbarModelSelector.utils'
import { Check, ChevronsUpDown, Eye, Lightbulb, Search } from 'lucide-react'
import React, { useMemo, useState } from 'react'

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

const ChatToolbarModelSelector: React.FC<ChatToolbarModelSelectorProps> = (props) => {
  const [searchQuery, setSearchQuery] = useState('')

  const groupedOptions = useMemo(() => {
    return groupModelSelectorOptions(props.modelOptions)
  }, [props.modelOptions])
  const filteredGroups = useMemo(() => {
    return filterModelSelectorGroups(groupedOptions, searchQuery)
  }, [groupedOptions, searchQuery])

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

  const mainCollisionProps = {
    avoidCollisions: true,
    collisionPadding: 12,
    sticky: 'always' as const
  }

  const subCollisionProps = {
    avoidCollisions: true,
    collisionPadding: 12,
    sticky: 'always' as const
  }

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open)
    if (!open) {
      setSearchQuery('')
    }
  }

  return (
    <DropdownMenu open={props.isOpen} onOpenChange={handleOpenChange}>
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
        {...mainCollisionProps}
        className={cn(
          'w-80 overflow-visible rounded-xl p-0',
          'border border-white/65 bg-white/92 text-slate-800 shadow-xl shadow-slate-900/10 backdrop-blur-2xl',
          'dark:border-white/10 dark:bg-gray-900/94 dark:text-slate-100 dark:shadow-black/30'
        )}
        style={{
          maxWidth: 'min(calc(100vw - 2rem), var(--radix-dropdown-menu-content-available-width))'
        }}
      >
        <div className="border-b border-slate-200/70 p-2 dark:border-slate-800">
          <div className="flex h-8 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 text-slate-500 dark:border-slate-700/80 dark:bg-slate-950/50 dark:text-slate-400">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search model"
              className="h-full min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        <div
          className="overflow-y-auto p-1"
          style={{
            maxHeight: 'clamp(280px, calc(100vh - 8rem), 520px)'
          }}
        >
          {props.modelOptions.length === 0 && (
            <DropdownMenuItem disabled className="rounded-lg text-xs text-slate-500">
              No model found.
            </DropdownMenuItem>
          )}

          {props.modelOptions.length > 0 && filteredGroups.length === 0 && (
            <DropdownMenuItem disabled className="rounded-lg text-xs text-slate-500">
              No matching model.
            </DropdownMenuItem>
          )}

          {filteredGroups.map((group, groupIndex) => {
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
                            'focus:bg-slate-100/80 focus:text-slate-900 data-[state=open]:bg-slate-100/80 data-[state=open]:text-slate-900',
                            'dark:focus:bg-slate-800/70 dark:focus:text-slate-100 dark:data-[state=open]:bg-slate-800/70 dark:data-[state=open]:text-slate-100'
                          )}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate">{option.model.label}</span>
                            {(option.model.type === 'vlm' || option.model.type === 'mllm') && (
                              <Eye className="size-3.5! shrink-0 text-emerald-500 dark:text-emerald-400" />
                            )}
                            <Lightbulb className="size-3.5! shrink-0 text-amber-500 dark:text-amber-300" />
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
                          {...subCollisionProps}
                          className={cn(
                            'min-w-36 rounded-xl border border-white/65 bg-white p-1 text-slate-800 shadow-xl shadow-slate-900/10 backdrop-blur-3xl',
                            'dark:border-white/10 dark:bg-gray-900/94 dark:text-slate-100 dark:shadow-black/30'
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
                                  'focus:bg-slate-100/80 focus:text-slate-900 dark:focus:bg-slate-800/70 dark:focus:text-slate-100'
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
                        'focus:bg-slate-100/80 focus:text-slate-900 dark:focus:bg-slate-800/70 dark:focus:text-slate-100'
                      )}
                      onSelect={() => handleModelSelect(option)}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate">{option.model.label}</span>
                        {(option.model.type === 'vlm' || option.model.type === 'mllm') && (
                          <Eye className="size-3.5! shrink-0 text-emerald-500 dark:text-emerald-400" />
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
