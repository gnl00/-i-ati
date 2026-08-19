import React, { useEffect, useMemo, useState } from 'react'
import { cn } from '@renderer/shared/lib/utils'
import { Input } from '@renderer/shared/components/ui/input'
import { Badge } from '@renderer/shared/components/ui/badge'
import { Label } from '@renderer/shared/components/ui/label'
import {
  Drawer,
  DrawerContent,
  DrawerFooter
} from '@renderer/shared/components/ui/drawer'
import DrawerHeaderBar from '@renderer/shared/components/ui/DrawerHeaderBar'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/shared/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/shared/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/shared/components/ui/tooltip'
import ExpandableSearchInput from '../common/ExpandableSearchInput'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { invokeModelsGetModelCapabilities } from '@renderer/infrastructure/ipc'
import InlineDeleteConfirm from '@renderer/features/settings/common/InlineDeleteConfirm'
import { toast } from 'sonner'
import {
  SettingsEmptyState,
  settingsInputClassName,
  settingsOutlineButtonClassName,
  settingsPrimaryButtonClassName,
  settingsScrollbarClassName,
  settingsSecondaryButtonClassName
} from '../common/SettingsLayout'
import { Button } from '@renderer/shared/components/ui/button'

type ProviderModelsPanelProps = {
  selectedProviderId?: string
  currentAccount?: ProviderAccount
  onModelTableCellClick: (value: string) => void
  onOpenFetchModels: () => void
  isFetchDisabled: boolean
  ensureAccountForProvider: (providerId: string) => ProviderAccount
}

// fr units: allocated after container width is known → never overflows
const GRID_COLS = '50fr 14fr 16fr 20fr'
const ADD_ROW_GRID_COLS = '30fr 34fr 20fr 16fr'
const MODEL_TOOLTIP_CLASS_NAME = 'bg-gray-900/95 dark:bg-(--app-surface-raised) backdrop-blur-xl dark:backdrop-blur-none border border-gray-700/50 dark:border-(--app-border-standard) text-gray-100 dark:text-(--app-text-primary) text-xs px-3 py-1.5 rounded-lg shadow-xl shadow-black/20'
const MODEL_ADD_FIELD_CLASSNAME = 'h-8 rounded-lg border border-transparent bg-gray-100/80 px-2.5 text-[12.5px] text-gray-800 shadow-inner ring-1 ring-inset ring-gray-200/70 transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[11px] placeholder:tracking-tight placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-1 focus:ring-gray-400/70 focus:ring-offset-0 focus-visible:border-gray-300 focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0 dark:bg-(--app-surface-inset) dark:text-(--app-text-body) dark:ring-(--app-border-standard) dark:placeholder:text-(--app-text-muted) dark:focus:border-(--app-accent) dark:focus:bg-(--app-surface-inset) dark:focus:ring-(--app-accent) dark:focus-visible:border-(--app-accent) dark:focus-visible:bg-(--app-surface-inset) dark:focus-visible:ring-(--app-accent)'
const MODEL_TYPE_SELECT_TRIGGER_CLASSNAME = cn(
  'w-full rounded-lg border border-gray-200/85 bg-white/90 text-[12.5px] text-gray-800 shadow-xs',
  'transition-[background-color,border-color,box-shadow,color] duration-150',
  'hover:border-gray-300/90 hover:bg-gray-50/95 hover:shadow-sm',
  'focus:ring-1 focus:ring-gray-400/70 focus:ring-offset-0',
  'focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0',
  'data-[state=open]:border-gray-400/80 data-[state=open]:bg-white data-[state=open]:shadow-sm',
  'disabled:cursor-not-allowed disabled:opacity-50',
  '[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-gray-400 [&>svg]:opacity-80',
  'dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body) dark:shadow-none',
  'dark:hover:border-(--app-accent) dark:hover:bg-(--app-surface-hover)',
  'dark:focus:border-(--app-accent) dark:focus:ring-(--app-accent) dark:focus-visible:border-(--app-accent) dark:focus-visible:ring-(--app-accent)',
  'dark:data-[state=open]:border-(--app-accent) dark:data-[state=open]:bg-(--app-surface-hover)',
  'dark:[&>svg]:text-(--app-text-muted)'
)
const EDIT_MODEL_TYPE_SELECT_TRIGGER_CLASSNAME = cn(
  MODEL_TYPE_SELECT_TRIGGER_CLASSNAME,
  'dark:bg-(--app-surface-inset) dark:ring-1 dark:ring-inset dark:ring-white/5',
  'dark:[&>svg]:text-(--app-text-secondary)'
)

const MODALITY_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'pdf', label: 'PDF' },
  { value: 'tool', label: 'Tool' },
  { value: 'reason', label: 'Reason' }
] as const

const formatContextWindowTokens = (value: string | number | undefined): string => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }

  return Number.parseInt(digits, 10).toLocaleString('en-US')
}

const getDefaultModalitiesForType = (type: ModelType): string[] => {
  switch (type) {
    case 'vlm':
    case 'mllm':
      return ['text', 'image']
    case 'img_gen':
      return ['image']
    case 'llm':
    default:
      return ['text']
  }
}

const getModalityTagClassName = (modality: string): string => {
  switch (modality) {
    case 'image':
      return 'border-sky-200/70 bg-sky-50/70 text-sky-800 dark:border-sky-800/35 dark:bg-sky-950/20 dark:text-sky-300/90'
    case 'audio':
      return 'border-violet-200/70 bg-violet-50/70 text-violet-800 dark:border-violet-800/35 dark:bg-violet-950/20 dark:text-violet-300/90'
    case 'video':
      return 'border-fuchsia-200/65 bg-fuchsia-50/60 text-fuchsia-800 dark:border-fuchsia-800/30 dark:bg-fuchsia-950/15 dark:text-fuchsia-300/90'
    case 'pdf':
      return 'border-rose-200/65 bg-rose-50/60 text-rose-800 dark:border-rose-800/30 dark:bg-rose-950/15 dark:text-rose-300/90'
    case 'tool':
      return 'border-amber-200/70 bg-amber-50/70 text-amber-800 dark:border-amber-800/35 dark:bg-amber-950/20 dark:text-amber-300/90'
    case 'reason':
      return 'border-emerald-200/70 bg-emerald-50/70 text-emerald-800 dark:border-emerald-800/35 dark:bg-emerald-950/20 dark:text-emerald-300/90'
    case 'text':
    default:
      return 'border-gray-200/80 bg-white/70 text-gray-600 dark:border-(--app-border-standard) dark:bg-white/3 dark:text-(--app-text-secondary)'
  }
}

const getModalityMarkerClassName = (modality: string): string => {
  switch (modality) {
    case 'image':
      return 'bg-sky-500 dark:bg-sky-400'
    case 'audio':
      return 'bg-violet-500 dark:bg-violet-400'
    case 'video':
      return 'bg-fuchsia-500 dark:bg-fuchsia-400'
    case 'pdf':
      return 'bg-rose-500 dark:bg-rose-400'
    case 'tool':
      return 'bg-amber-500 dark:bg-amber-400'
    case 'reason':
      return 'bg-emerald-500 dark:bg-emerald-400'
    case 'text':
    default:
      return 'bg-gray-500 dark:bg-gray-400'
  }
}

const areStringSetsEqual = (left: string[] = [], right: string[] = []): boolean => {
  if (left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left)
  return right.every(item => leftSet.has(item))
}

const shouldApplyRemoteModalities = (
  model: AccountModel,
  remoteModalities: string[]
): boolean => {
  if (remoteModalities.length === 0) {
    return false
  }

  const currentModalities = model.modalities ?? []
  if (currentModalities.length === 0) {
    return true
  }

  if (areStringSetsEqual(currentModalities, getDefaultModalitiesForType(model.type))) {
    return true
  }

  return false
}

export const ProviderModelsPanel: React.FC<ProviderModelsPanelProps> = ({
  selectedProviderId,
  currentAccount,
  onModelTableCellClick,
  onOpenFetchModels,
  isFetchDisabled,
  ensureAccountForProvider
}) => {
  const { addModel, updateModel, removeModel, toggleModelEnabled } = useAppConfigStore()
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('')
  const [nextAddModelLabel, setNextAddModelLabel] = useState<string>('')
  const [nextAddModelValue, setNextAddModelValue] = useState<string>('')
  const [nextAddModelType, setNextAddModelType] = useState<string>('llm')
  const [editingModel, setEditingModel] = useState<AccountModel | undefined>(undefined)
  const [editingModelType, setEditingModelType] = useState<ModelType>('llm')
  const [editingContextWindowTokens, setEditingContextWindowTokens] = useState<string>('')
  const [editingModalities, setEditingModalities] = useState<string[]>([])
  const [editingModalitiesDirty, setEditingModalitiesDirty] = useState(false)
  const canAddModel = nextAddModelValue.trim().length > 0

  const modelCapabilitySyncKey = useMemo(() => {
    return currentAccount?.models.map(model => model.id).join('\n') ?? ''
  }, [currentAccount?.models])

  const filteredModels = useMemo(() => {
    const models = currentAccount?.models ?? []
    const query = modelSearchQuery.trim().toLowerCase()
    if (!query) return models
    return models.filter(model => {
      return (
        model.label.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.type.toLowerCase().includes(query)
      )
    })
  }, [currentAccount?.models, modelSearchQuery])

  useEffect(() => {
    if (!currentAccount?.id || modelCapabilitySyncKey.length === 0) {
      return
    }

    let cancelled = false
    const accountId = currentAccount.id
    const modelIds = currentAccount.models.map(model => model.id)

    invokeModelsGetModelCapabilities({ modelIds })
      .then((response) => {
        if (cancelled) {
          return
        }

        const latestAccount = useAppConfigStore.getState().getAccountById(accountId)
        if (!latestAccount) {
          return
        }

        latestAccount.models.forEach((model) => {
          const snapshot = response.models[model.id] ?? response.models[model.id.trim()]
          if (!snapshot) {
            return
          }

          const updates: Partial<AccountModel> = {}
          if (
            shouldApplyRemoteModalities(model, snapshot.modalities)
            && !areStringSetsEqual(model.modalities ?? [], snapshot.modalities)
          ) {
            updates.modalities = snapshot.modalities
          }

          if (!areStringSetsEqual(model.capabilities ?? [], snapshot.capabilities)) {
            updates.capabilities = snapshot.capabilities
          }

          if (
            typeof snapshot.contextWindowTokens === 'number'
            && snapshot.contextWindowTokens > 0
            && model.contextWindowTokens !== snapshot.contextWindowTokens
          ) {
            updates.contextWindowTokens = snapshot.contextWindowTokens
          }

          if (Object.keys(updates).length > 0) {
            updateModel(latestAccount.id, model.id, updates)
          }
        })
      })
      .catch((error) => {
        console.warn('Failed to sync model capabilities:', error)
      })

    return (): void => {
      cancelled = true
    }
  }, [currentAccount?.id, modelCapabilitySyncKey, updateModel])

  const handleAddModel = (): void => {
    const payload = {
      label: nextAddModelLabel,
      value: nextAddModelValue,
      type: (nextAddModelType || 'llm') as ModelType
    }
    if (!selectedProviderId) return
    if (!payload.value.trim()) {
      toast.error('Model ID is required')
      return
    }
    const account = currentAccount ?? ensureAccountForProvider(selectedProviderId)
    const newModel: AccountModel = {
      id: payload.value.trim(),
      label: payload.label.trim() || payload.value.trim(),
      type: payload.type || 'llm',
      modalities: getDefaultModalitiesForType(payload.type || 'llm'),
      enabled: true
    }
    addModel(account.id, newModel)
    setNextAddModelLabel('')
    setNextAddModelValue('')
    setNextAddModelType('llm')
  }

  const openEditModal = (model: AccountModel): void => {
    setEditingModel(model)
    setEditingModelType(model.type)
    setEditingContextWindowTokens(formatContextWindowTokens(model.contextWindowTokens))
    setEditingModalities(model.modalities?.length ? [...model.modalities] : getDefaultModalitiesForType(model.type))
    setEditingModalitiesDirty(false)
  }

  const toggleEditingModality = (modality: string, checked: boolean): void => {
    setEditingModalitiesDirty(true)
    setEditingModalities((prev) => {
      if (checked) {
        return prev.includes(modality) ? prev : [...prev, modality]
      }
      return prev.filter(item => item !== modality)
    })
  }

  const handleSaveModalities = (): void => {
    if (!currentAccount || !editingModel) {
      return
    }

    const parsedContextWindowTokens = Number.parseInt(editingContextWindowTokens.replace(/,/g, ''), 10)
    updateModel(currentAccount.id, editingModel.id, {
      type: editingModelType,
      modalities: editingModalities,
      contextWindowTokens: Number.isFinite(parsedContextWindowTokens) && parsedContextWindowTokens > 0
        ? parsedContextWindowTokens
        : undefined
    })
    setEditingModel(undefined)
    setEditingContextWindowTokens('')
    setEditingModalitiesDirty(false)
  }

  return (
    <div className='flex-1 min-h-0 flex flex-col overflow-hidden'>

      <Drawer
        open={!!editingModel}
        onOpenChange={(open) => {
          if (open) return
          setEditingModel(undefined)
          setEditingContextWindowTokens('')
        }}
      >
        <DrawerContent className="max-h-[55vh] border-gray-200 bg-white text-gray-900 dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body) overflow-hidden overscroll-contain">
          <DrawerHeaderBar
            title={
              editingModel && editingModel.label.trim() !== editingModel.id.trim()
                ? editingModel.label
                : 'Edit model'
            }
            context={editingModel ? (
              <button
                type="button"
                onClick={() => onModelTableCellClick(editingModel.id)}
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-mono text-[10.5px] transition-colors duration-150 hover:text-gray-900 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-gray-400 dark:hover:text-(--app-text-primary) dark:focus-visible:ring-(--app-accent)"
                aria-label={`Copy model ID ${editingModel.id}`}
                title="Copy model ID"
              >
                <span className="truncate">{editingModel.id}</span>
              </button>
            ) : undefined}
            className="shrink-0"
          />

          <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', settingsScrollbarClassName)}>
            <div className="w-full space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(180px,0.72fr)_minmax(260px,1.28fr)]">
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-700 dark:text-(--app-text-body)">
                    Model type
                  </Label>
                  <Select
                    value={editingModelType}
                    onValueChange={(value) => {
                      const nextType = value as ModelType
                      setEditingModelType(nextType)
                      if (!editingModalitiesDirty) {
                        setEditingModalities(getDefaultModalitiesForType(nextType))
                      }
                    }}
                  >
                    <SelectTrigger className={cn(EDIT_MODEL_TYPE_SELECT_TRIGGER_CLASSNAME, 'h-9')}>
                      <SelectValue placeholder="Select model type" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg bg-white/95 font-medium shadow-lg backdrop-blur dark:bg-(--app-surface-raised) dark:backdrop-blur-none">
                      <SelectGroup>
                        <SelectItem value="llm" className='text-[11px] tracking-tight'>LLM</SelectItem>
                        <SelectItem value="vlm" className='text-[11px] tracking-tight'>VLM</SelectItem>
                        <SelectItem value="mllm" className='text-[11px] tracking-tight'>MLLM</SelectItem>
                        <SelectItem value="img_gen" className='text-[11px] tracking-tight'>IMG_GEN</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editing-context-window" className="text-[12px] font-medium text-gray-700 dark:text-(--app-text-body)">
                    Context window
                  </Label>
                  <div className="relative">
                    <Input
                      id="editing-context-window"
                      type="text"
                      inputMode="numeric"
                      value={editingContextWindowTokens}
                      onChange={(event) => setEditingContextWindowTokens(formatContextWindowTokens(event.target.value))}
                      placeholder="128,000"
                      className={cn(
                        settingsInputClassName,
                        'h-9 bg-white pr-16 font-mono text-[12.5px] tabular-nums dark:bg-(--app-surface-inset)'
                      )}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10.5px] font-medium text-gray-400 dark:text-(--app-text-muted)">
                      tokens
                    </span>
                  </div>
                </div>
              </div>

              <section className="space-y-2" aria-labelledby="modalities-label">
                <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
                  <Label id="modalities-label" className="text-[12px] font-medium text-gray-700 dark:text-(--app-text-body)">
                    Modalities
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingModalities(getDefaultModalitiesForType(editingModelType))
                      setEditingModalitiesDirty(false)
                    }}
                    className="ml-auto rounded-md px-2 py-1 text-[10.5px] font-medium text-gray-500 transition-[background-color,color,transform] duration-150 hover:bg-gray-100 hover:text-gray-800 active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-gray-400 dark:text-(--app-text-secondary) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary) dark:focus-visible:ring-(--app-accent)"
                  >
                    Reset to defaults
                  </button>
                </div>

                <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-gray-200/80 bg-gray-50/70 p-2.5 shadow-inner dark:border-(--app-border-standard) dark:bg-(--app-surface-inset) dark:shadow-none">
                  {editingModalities.map((modality) => {
                    const option = MODALITY_OPTIONS.find(item => item.value === modality)
                    return (
                      <span
                        key={modality}
                        className={cn(
                          'inline-flex h-7 items-center gap-1 rounded-md border pl-2.5 pr-1 text-[11px] font-medium',
                          getModalityTagClassName(modality)
                        )}
                      >
                        {option?.label ?? modality}
                        <button
                          type="button"
                          onClick={() => toggleEditingModality(modality, false)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-current/65 transition-[background-color,color,transform] duration-150 hover:bg-black/10 hover:text-current active:scale-95 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-current dark:hover:bg-white/10"
                          aria-label={`Remove ${option?.label ?? modality} modality`}
                        >
                          <i className="ri-close-line text-[13px]" aria-hidden="true" />
                        </button>
                      </span>
                    )
                  })}

                  {editingModalities.length === 0 ? (
                    <span className="px-1 text-[11px] text-gray-400 dark:text-(--app-text-muted)">
                      No modalities selected
                    </span>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={editingModalities.length === MODALITY_OPTIONS.length}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white/70 px-2.5 text-[11px] font-medium text-gray-600 transition-[background-color,border-color,color,transform] duration-150 hover:border-gray-400 hover:bg-white hover:text-gray-900 active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-45 dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-secondary) dark:hover:border-(--app-accent) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary) dark:focus-visible:ring-(--app-accent)"
                      >
                        <i className="ri-add-line text-[12px]" aria-hidden="true" />
                        Add modality
                        <i className="ri-arrow-down-s-line text-[12px] opacity-70" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={6}
                      className="min-w-44 rounded-lg border-gray-200/80 bg-white p-1.5 text-gray-800 shadow-lg dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body)"
                    >
                      {MODALITY_OPTIONS.filter(option => !editingModalities.includes(option.value)).map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onSelect={() => toggleEditingModality(option.value, true)}
                          className="h-8 rounded-md px-2 text-[11.5px] focus:bg-gray-100 focus:text-gray-900 dark:focus:bg-(--app-surface-hover) dark:focus:text-(--app-text-primary)"
                        >
                          <span className={cn('h-2 w-2 rounded-sm', getModalityMarkerClassName(option.value))} aria-hidden="true" />
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-[10.5px] leading-4 text-gray-500 dark:text-(--app-text-secondary)">
                  Select the input and capability formats this model can handle.
                </p>
              </section>
            </div>
          </div>

          <DrawerFooter className="sticky bottom-0 shrink-0 border-t border-gray-200/80 bg-gray-50/80 px-5 py-3 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {currentAccount ? (
                <p className="mr-auto min-w-0 truncate text-[10.5px] text-gray-400 dark:text-(--app-text-muted)">
                  Changes apply to {currentAccount.label}.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setEditingModel(undefined)
                  setEditingContextWindowTokens('')
                  setEditingModalitiesDirty(false)
                }}
                className={cn(settingsOutlineButtonClassName, 'h-8 min-w-20 justify-center px-3 text-[11px]')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalities}
                className={cn(settingsPrimaryButtonClassName, 'h-8 min-w-28 justify-center px-3 text-[11px]')}
              >
                Save changes
              </button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className='flex items-center gap-3 px-2 py-2 border-b border-gray-200/70 dark:border-(--app-border-subtle) bg-gray-50/40 dark:bg-(--app-surface-inset) shrink-0'>
        <h3 className='text-xs font-semibold tracking-tight text-gray-900 dark:text-(--app-text-primary) shrink-0'>Models</h3>
        <div className="flex items-center gap-2 ml-auto flex-row">
          <ExpandableSearchInput
            value={modelSearchQuery}
            onChange={setModelSearchQuery}
            placeholder="Search models..."
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={onOpenFetchModels}
            disabled={isFetchDisabled}
            className='space-x-0.5 text-[11px] tracking-tight text-gray-500 dark:text-(--app-text-secondary)'
          >
            <i className="ri-download-cloud-line"></i>
            <span>Fetch Models</span>
          </Button>
        </div>
      </div>

      {/* ── Add row ──────────────────────────────────────────── */}
      <div
        className='grid shrink-0 border-b border-gray-200/80 bg-gray-50/75 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset) py-2 px-2 space-x-2'
        style={{ gridTemplateColumns: ADD_ROW_GRID_COLS }}
      >
        <div className=''>
          <Input
            className={cn(MODEL_ADD_FIELD_CLASSNAME, 'w-full')}
            value={nextAddModelLabel}
            onChange={e => setNextAddModelLabel(e.target.value)}
            placeholder="Model Name"
          />
        </div>
        <div className=''>
          <Input
            className={cn(MODEL_ADD_FIELD_CLASSNAME, 'w-full')}
            value={nextAddModelValue}
            onChange={e => setNextAddModelValue(e.target.value)}
            placeholder="Model ID"
          />
        </div>
        <div className='flex items-center justify-center'>
          <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
            <SelectTrigger
              className={cn(MODEL_TYPE_SELECT_TRIGGER_CLASSNAME, 'h-8')}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-white/95 dark:bg-(--app-surface-raised) rounded-lg shadow-xs backdrop-blur dark:backdrop-blur-none font-medium">
              <SelectGroup>
                <SelectItem value="llm" className='text-[11px] tracking-tight'>LLM</SelectItem>
                <SelectItem value="vlm" className='text-[11px] tracking-tight'>VLM</SelectItem>
                <SelectItem value="mllm" className='text-[11px] tracking-tight'>MLLM</SelectItem>
                <SelectItem value="img_gen" className='text-[11px] tracking-tight'>IMG_GEN</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-center justify-center'>
          <Button
            onClick={handleAddModel}
            disabled={!canAddModel}
            className={cn('h-7 w-full flex items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-45')}
          >
            <i className="ri-add-line text-[12px]"></i>
            <span>Add</span>
          </Button>
        </div>
      </div>

      {/* ── Scrollable model rows ─────────────────────────────── */}
      <div className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden', settingsScrollbarClassName)}>
        {filteredModels.length > 0 ? (
          <TooltipProvider delayDuration={400}>
            {filteredModels.map((m, idx) => {
              const displayModalities = m.modalities ?? getDefaultModalitiesForType(m.type)

              return (
              <div
                key={idx}
                className={cn(
                  'grid border-b border-gray-100 dark:border-(--app-border-subtle)',
                  'hover:bg-gray-50 dark:hover:bg-(--app-surface-hover) transition-colors duration-150',
                  'animate-in fade-in slide-in-from-bottom-1'
                )}
                style={{
                  gridTemplateColumns: GRID_COLS,
                  animationDelay: `${idx * 40}ms`,
                  animationFillMode: 'both'
                }}
              >
                <div className='px-4 py-2 min-w-0 flex items-center'>
                  <div className='min-w-0 w-full space-y-1'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p
                          className='truncate text-[12.5px] font-medium text-gray-700 dark:text-(--app-text-body) cursor-pointer hover:text-gray-900 dark:hover:text-(--app-text-primary) transition-colors duration-150'
                          onClick={() => onModelTableCellClick(m.label)}
                        >
                          {m.label}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent className={MODEL_TOOLTIP_CLASS_NAME}>
                        <p className="font-medium">{m.label}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p
                          className='truncate text-[11px] text-gray-500 dark:text-(--app-text-secondary) font-mono cursor-pointer hover:text-gray-700 dark:hover:text-(--app-text-primary) transition-colors duration-150'
                          onClick={() => onModelTableCellClick(m.id)}
                        >
                          {m.id}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent className={MODEL_TOOLTIP_CLASS_NAME}>
                        <p className="font-medium">{m.id}</p>
                      </TooltipContent>
                    </Tooltip>
                    <div className='flex flex-wrap gap-1 min-h-[18px]'>
                      {displayModalities.length > 0 ? (
                        displayModalities.map((modality) => (
                          <span
                            key={modality}
                            className={cn(
                              'inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
                              getModalityTagClassName(modality)
                            )}
                          >
                            {modality}
                          </span>
                        ))
                      ) : (
                        <span className='text-[10px] text-gray-400 dark:text-(--app-text-muted)'>
                          No modalities
                        </span>
                      )}
                    </div>
                    {m.contextWindowTokens ? (
                      <p className='text-[10px] text-gray-400 dark:text-(--app-text-muted) font-mono'>
                        ctx {m.contextWindowTokens.toLocaleString()} tokens
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className='px-4 py-2.5 flex items-center justify-center'>
                  <Badge variant="secondary" className='text-[9.5px] font-medium uppercase px-1.5 py-0.5 bg-gray-100 dark:bg-(--app-surface-inset) text-gray-500 dark:text-(--app-text-secondary) border-0'>
                    {m.type}
                  </Badge>
                </div>
                <div className='px-4 py-2.5 flex items-center justify-center'>
                  <button
                    role="switch"
                    aria-checked={m.enabled !== false}
                    onClick={() => {
                      if (!currentAccount) return
                      toggleModelEnabled(currentAccount.id, m.id)
                    }}
                    className={cn(
                      'relative inline-flex h-[18px] w-[30px] shrink-0 cursor-pointer rounded-full',
                      'transition-colors duration-200 ease-in-out',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1',
                      m.enabled !== false
                        ? 'bg-gray-800 dark:bg-(--app-accent-strong)'
                        : 'bg-gray-200 dark:bg-(--app-surface-inset)'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-[14px] w-[14px] rounded-full shadow-sm',
                        'transition-transform duration-200 ease-in-out',
                        'mt-[2px]',
                        m.enabled !== false
                          ? 'translate-x-[14px] bg-white dark:bg-(--app-canvas)'
                          : 'translate-x-[2px] bg-white dark:bg-(--app-text-muted)'
                      )}
                    />
                  </button>
                </div>
                <div className='px-4 py-2.5 flex items-center justify-center'>
                  <div className='flex flex-col items-center justify-center gap-1'>
                    <button
                      type="button"
                      onClick={() => openEditModal(m)}
                      className={cn(settingsSecondaryButtonClassName, 'h-5 px-2 text-[10.5px]')}
                    >
                      <i className="ri-edit-line text-[11px]" />
                      Edit
                    </button>
                    <div className='w-8 border-t border-gray-200 dark:border-(--app-border-subtle)' />
                    <InlineDeleteConfirm
                      onConfirm={() => {
                        if (!currentAccount) return
                        removeModel(currentAccount.id, m.id)
                      }}
                      ariaLabel={`Remove model ${m.label}`}
                      title="Remove model"
                      idleLabel="Delete"
                      width={58}
                      height={24}
                      iconClassName='text-[12px]'
                    />
                  </div>
                </div>
              </div>
              )
            })}
          </TooltipProvider>
        ) : (
          <SettingsEmptyState
            icon={<i className={`${!currentAccount || currentAccount.models.length === 0 ? 'ri-inbox-line' : 'ri-search-line'} text-[18px] text-gray-400 dark:text-(--app-text-muted)`} />}
            title={!currentAccount || currentAccount.models.length === 0 ? 'No models yet' : 'No models match'}
            description={!currentAccount || currentAccount.models.length === 0 ? 'Add a model using the form above' : 'Try a different keyword'}
            className="py-10"
          />
        )}
      </div>

    </div>
  )
}
