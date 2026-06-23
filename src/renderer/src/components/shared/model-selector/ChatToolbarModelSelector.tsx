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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import type { ModelOption } from '@renderer/store/appConfig'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import {
  getDefaultThinkingLevel,
  getRequestAdapterThinkingCapability,
  modelSupportsThinking
} from '@shared/plugins/requestAdapterThinking'
import { Check, ChevronsUpDown, Eye, Lightbulb, Search } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import {
  filterModelSelectorGroups,
  groupModelSelectorOptions,
  resolveChatToolbarModelSelection,
  type ModelSelectorGroup
} from './ChatToolbarModelSelector.utils'

type ChatToolbarModelSelectorVariant = 'default' | 'baseline'

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
  hideSelectedHoverShine?: boolean
  variant?: ChatToolbarModelSelectorVariant
}

type ThinkingCapability = NonNullable<ReturnType<typeof getRequestAdapterThinkingCapability>>

const getModelKey = (option: ModelOption) => `${option.account.id}/${option.model.id}`

const modelHasVision = (option: ModelOption) => {
  return option.model.type === 'vlm' || option.model.type === 'mllm'
}

const getThinkingLabel = (value: ThinkingLevel | undefined) => {
  return value ? value : undefined
}

const getMenuCollisionProps = () => ({
  avoidCollisions: true,
  collisionPadding: 16,
  sticky: 'always' as const
})

const getSubMenuCollisionProps = () => ({
  avoidCollisions: true,
  collisionPadding: 12,
  sticky: 'always' as const
})

const getTriggerClassName = (
  variant: ChatToolbarModelSelectorVariant,
  selected: boolean,
  triggerClassName?: string
) => {
  if (variant === 'baseline') {
    return cn(
      'group relative flex h-8 min-w-[118px] max-w-[184px] items-center justify-between gap-1.5 overflow-hidden rounded-xl px-2.5 py-0.5',
      'border border-transparent bg-transparent text-[11px] font-medium text-muted-foreground shadow-none',
      'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
      'hover:border-border/45 hover:bg-foreground/[0.035] hover:text-foreground hover:shadow-[0_8px_18px_color-mix(in_srgb,hsl(var(--foreground))_4%,transparent)]',
      'active:scale-[0.985] focus-visible:ring-0 focus-visible:ring-offset-0',
      selected && 'border-border/35 bg-transparent text-foreground dark:border-border/30',
      triggerClassName
    )
  }

  return cn(
    'group relative flex h-7 min-w-24 w-auto items-center justify-between gap-1.5 overflow-hidden rounded-2xl px-2.5 py-0.5',
    'border text-xs font-medium transition-all duration-300 ease-out active:scale-[0.98]',
    'focus-visible:ring-0 focus-visible:ring-offset-0',
    selected
      ? [
          'border-emerald-300/60 bg-linear-to-br from-emerald-50 to-teal-50 text-emerald-700 shadow-xs shadow-emerald-500/10',
          'hover:shadow-sm hover:shadow-emerald-500/25',
          'dark:border-emerald-700/60 dark:from-emerald-950/40 dark:to-teal-950/40 dark:text-emerald-300 dark:shadow-emerald-500/20 dark:hover:shadow-emerald-500/35'
        ]
      : [
          'border-slate-200/50 bg-slate-50/50 text-slate-500',
          'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700',
          'dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300'
        ],
    triggerClassName
  )
}

interface ModelSelectorTriggerProps extends Omit<React.ComponentPropsWithoutRef<typeof Button>, 'variant'> {
  selectedModel: ModelOption | undefined
  selectedThinkingLevel: ThinkingLevel | undefined
  selectedThinkingCapability: ThinkingCapability | undefined
  isOpen: boolean
  variant: ChatToolbarModelSelectorVariant
  triggerClassName?: string
  hideSelectedHoverShine?: boolean
}

const ModelSelectorTrigger = React.forwardRef<HTMLButtonElement, ModelSelectorTriggerProps>(({
  selectedModel,
  selectedThinkingLevel,
  selectedThinkingCapability,
  isOpen,
  variant,
  triggerClassName,
  hideSelectedHoverShine,
  ...triggerProps
}, ref) => {
  const selected = Boolean(selectedModel)
  const showNeutralHoverSheen = selected && variant === 'default' && !hideSelectedHoverShine

  return (
    <Button
      ref={ref}
      {...triggerProps}
      variant="outline"
      role="combobox"
      aria-expanded={isOpen}
      className={getTriggerClassName(variant, selected, triggerClassName)}
    >
      {showNeutralHoverSheen && (
        <div className="absolute inset-0 bg-linear-to-r from-white/0 via-white/35 to-white/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:via-white/10" />
      )}

      <span className="relative z-10 flex min-w-0 grow justify-center overflow-x-hidden select-none">
        {selectedModel ? (
          <TooltipProvider delayDuration={350}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0 items-center gap-1.5 animate-in fade-in slide-in-from-left-1 duration-300">
                  <span className="truncate">{selectedModel.model.label}</span>
                  {modelHasVision(selectedModel) && (
                    <Eye className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-300" />
                  )}
                  {selectedThinkingLevel && selectedThinkingCapability && (
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {selectedThinkingLevel}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                sideOffset={8}
                className="max-w-64 rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-slate-600/50 dark:bg-slate-800/95"
              >
                <span className="block truncate">{selectedModel.model.label}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground/70">Select Model</span>
        )}
      </span>

      <ChevronsUpDown
        className={cn(
          'relative z-10 flex h-4 w-4 opacity-50 transition-all duration-300 group-hover:opacity-100',
          isOpen && 'rotate-180'
        )}
      />
    </Button>
  )
})
ModelSelectorTrigger.displayName = 'ModelSelectorTrigger'

interface ModelSearchBoxProps {
  value: string
  onChange: (value: string) => void
}

const ModelSearchBox: React.FC<ModelSearchBoxProps> = ({ value, onChange }) => {
  return (
    <div className="border-b border-border/55 p-2">
      <div
        className={cn(
          'flex h-8 items-center gap-2 rounded-xl border border-border/50 bg-muted/45 px-2 text-muted-foreground',
          'transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-border/80 focus-within:bg-background/80 focus-within:shadow-xs'
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && value) {
              event.preventDefault()
              event.stopPropagation()
              onChange('')
              return
            }

            if (event.key !== 'Escape') {
              event.stopPropagation()
            }
          }}
          placeholder="Search model"
          className="h-full min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground outline-hidden placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  )
}

interface ProviderGroupSectionProps {
  group: ModelSelectorGroup
  index: number
  children: React.ReactNode
}

const ProviderGroupSection: React.FC<ProviderGroupSectionProps> = ({ group, index, children }) => {
  const displayName = group.definition.displayName
  const showAccountLabel = group.account.label !== displayName

  return (
    <DropdownMenuGroup>
      {index > 0 && <DropdownMenuSeparator className="bg-border/55" />}
      <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
        <img
          src={getProviderIcon(group.definition.iconKey || group.definition.id)}
          alt={displayName}
          className="h-4 w-4 object-contain opacity-70 dark:invert dark:brightness-90"
        />
        <span className="min-w-0 truncate">
          {displayName}
          {showAccountLabel && (
            <span className="ml-1 text-[10px] font-medium text-muted-foreground/70">
              {group.account.label}
            </span>
          )}
        </span>
      </DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  )
}

interface ModelOptionContentProps {
  option: ModelOption
  selected: boolean
  capability?: ThinkingCapability
  levelValue?: ThinkingLevel
}

const ModelOptionContent: React.FC<ModelOptionContentProps> = ({
  option,
  selected,
  capability,
  levelValue
}) => {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate">{option.model.label}</span>
        {modelHasVision(option) && (
          <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Eye className="mr-1 size-3!" />
            vision
          </span>
        )}
        {capability && (
          <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="mr-1 size-3!" />
            {getThinkingLabel(levelValue) ?? 'think'}
          </span>
        )}
      </span>
      {selected && (
        <span className="ml-2 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border/60 bg-background/85 text-foreground shadow-xs">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  )
}

interface ModelOptionItemProps {
  option: ModelOption
  selected: boolean
  onSelect: (option: ModelOption) => void
}

const ModelOptionItem: React.FC<ModelOptionItemProps> = ({ option, selected, onSelect }) => {
  return (
    <DropdownMenuItem
      className={cn(
        'my-0.5 rounded-lg border border-transparent px-2 py-2 text-xs font-medium text-foreground cursor-pointer',
        'transition-[background-color,border-color,color,box-shadow] duration-150',
        'focus:border-border/45 focus:bg-foreground/4 focus:text-foreground',
        selected && 'border-border/60 bg-foreground/4.5 shadow-xs'
      )}
      onSelect={() => onSelect(option)}
    >
      <ModelOptionContent option={option} selected={selected} />
    </DropdownMenuItem>
  )
}

interface ThinkingLevelSubMenuProps {
  option: ModelOption
  selected: boolean
  capability: ThinkingCapability
  levelValue: ThinkingLevel
  onSelect: (option: ModelOption, level: ThinkingLevel) => void
}

const ThinkingLevelSubMenu: React.FC<ThinkingLevelSubMenuProps> = ({
  option,
  selected,
  capability,
  levelValue,
  onSelect
}) => {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className={cn(
          'my-0.5 rounded-lg border border-transparent px-2 py-2 text-xs font-medium text-foreground cursor-pointer',
          'transition-[background-color,border-color,color,box-shadow] duration-150',
          'focus:border-border/45 focus:bg-foreground/4 focus:text-foreground',
          'data-[state=open]:border-border/55 data-[state=open]:bg-foreground/5.5',
          selected && 'border-border/60 bg-foreground/4.5 shadow-xs'
        )}
      >
        <ModelOptionContent
          option={option}
          selected={selected}
          capability={capability}
          levelValue={levelValue}
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        sideOffset={2}
        alignOffset={-5}
        {...getSubMenuCollisionProps()}
        className={cn(
          'min-w-40 overflow-visible rounded-2xl border border-border/60 bg-popover/95 p-1.5 text-popover-foreground',
          'shadow-xl shadow-black/10 backdrop-blur-xl'
        )}
        style={{
          maxWidth: 'var(--radix-dropdown-menu-content-available-width)'
        }}
      >
        <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/75">
          Thinking level
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={levelValue}
          onValueChange={(value) => onSelect(option, value as ThinkingLevel)}
        >
          {capability.levels.map(level => (
            <DropdownMenuRadioItem
              key={level}
              value={level}
              className={cn(
                'rounded-lg py-1.5 pl-6 pr-2 text-xs font-medium capitalize cursor-pointer',
                'transition-[background-color,color] duration-150',
                'focus:bg-foreground/4 focus:text-foreground'
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

const ChatToolbarModelSelector: React.FC<ChatToolbarModelSelectorProps> = (props) => {
  const [searchQuery, setSearchQuery] = useState('')
  const variant = props.variant ?? 'default'
  const contentSide = variant === 'baseline' ? 'top' : 'bottom'
  const contentSideOffset = variant === 'baseline' ? 10 : 8

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
      modelId: option.model.id,
      payloadExtensions: option.definition.payloadExtensions
    })
    return modelSupportsThinking(option.model, capability) ? capability : undefined
  }

  const selectedThinkingCapability = props.selectedModel
    ? getThinkingCapability(props.selectedModel)
    : undefined

  const handleModelSelect = (option: ModelOption, thinkingLevel?: ThinkingLevel) => {
    const selection = resolveChatToolbarModelSelection(option, props.plugins, thinkingLevel)
    props.onModelSelect(selection.ref, selection.thinkingLevel)
  }

  const isSelectedModel = (option: ModelOption) => {
    return props.selectedModel?.account.id === option.account.id
      && props.selectedModel?.model.id === option.model.id
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
        <ModelSelectorTrigger
          selectedModel={props.selectedModel}
          selectedThinkingLevel={props.selectedThinkingLevel}
          selectedThinkingCapability={selectedThinkingCapability}
          isOpen={props.isOpen}
          variant={variant}
          triggerClassName={props.triggerClassName}
          hideSelectedHoverShine={props.hideSelectedHoverShine}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={contentSide}
        sideOffset={contentSideOffset}
        {...getMenuCollisionProps()}
        className={cn(
          'w-80 overflow-visible rounded-2xl border border-border/60 bg-popover/95 p-0 text-popover-foreground',
          'shadow-xl shadow-black/10 backdrop-blur-xl'
        )}
        style={{
          maxWidth: 'min(calc(100vw - 2rem), var(--radix-dropdown-menu-content-available-width))'
        }}
      >
        <ModelSearchBox value={searchQuery} onChange={setSearchQuery} />
        <div
          className="overflow-y-auto p-1.5"
          style={{
            maxHeight: 'min(420px, calc(var(--radix-dropdown-menu-content-available-height) - 52px))'
          }}
        >
          {props.modelOptions.length === 0 && (
            <DropdownMenuItem disabled className="rounded-lg text-xs text-muted-foreground">
              No model found.
            </DropdownMenuItem>
          )}

          {props.modelOptions.length > 0 && filteredGroups.length === 0 && (
            <DropdownMenuItem disabled className="rounded-lg text-xs text-muted-foreground">
              No matching model.
            </DropdownMenuItem>
          )}

          {filteredGroups.map((group, groupIndex) => (
            <ProviderGroupSection
              key={group.account.id}
              group={group}
              index={groupIndex}
            >
              {group.options.map(option => {
                const capability = getThinkingCapability(option)
                const selected = isSelectedModel(option)
                const levelValue = selected && props.selectedThinkingLevel
                  ? props.selectedThinkingLevel
                  : capability
                    ? getDefaultThinkingLevel(capability)
                    : undefined

                if (capability && levelValue) {
                  return (
                    <ThinkingLevelSubMenu
                      key={getModelKey(option)}
                      option={option}
                      selected={selected}
                      capability={capability}
                      levelValue={levelValue}
                      onSelect={handleModelSelect}
                    />
                  )
                }

                return (
                  <ModelOptionItem
                    key={getModelKey(option)}
                    option={option}
                    selected={selected}
                    onSelect={handleModelSelect}
                  />
                )
              })}
            </ProviderGroupSection>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ChatToolbarModelSelector
