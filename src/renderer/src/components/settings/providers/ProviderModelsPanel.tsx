import React, { useEffect, useMemo, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@renderer/components/ui/drawer'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import ExpandableSearchInput from '../common/ExpandableSearchInput'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { invokeModelsGetModelCapabilities } from '@renderer/invoker/ipcInvoker'
import InlineDeleteConfirm from '@renderer/components/settings/common/InlineDeleteConfirm'
import { toast } from 'sonner'
import {
  SettingsEmptyState,
  settingsInputClassName,
  settingsOutlineButtonClassName,
  settingsPrimaryButtonClassName,
  settingsScrollbarClassName,
  settingsSecondaryButtonClassName
} from '../common/SettingsLayout'
import { Button } from '@renderer/components/ui/button'

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
const MODEL_TOOLTIP_CLASS_NAME = 'bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 dark:border-slate-600/50 text-slate-100 text-xs px-3 py-1.5 rounded-lg shadow-xl shadow-black/20'
const MODEL_ADD_FIELD_CLASSNAME = 'h-8 rounded-lg border border-transparent bg-gray-100/80 px-2.5 text-[12.5px] text-gray-800 shadow-inner ring-1 ring-inset ring-gray-200/70 transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[11px] placeholder:tracking-tight placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-1 focus:ring-gray-400/70 focus:ring-offset-0 focus-visible:border-gray-300 focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0 dark:bg-gray-950/45 dark:text-gray-100 dark:ring-gray-700 dark:placeholder:text-gray-500 dark:focus:border-gray-600 dark:focus:bg-gray-950/70 dark:focus:ring-gray-500/70 dark:focus-visible:border-gray-600 dark:focus-visible:bg-gray-950/70 dark:focus-visible:ring-gray-500/70'
const MODEL_TYPE_SELECT_TRIGGER_CLASSNAME = cn(
  'w-full rounded-lg border border-gray-200/85 bg-white/90 text-[12.5px] text-gray-800 shadow-xs',
  'transition-[background-color,border-color,box-shadow,color] duration-150',
  'hover:border-gray-300/90 hover:bg-gray-50/95 hover:shadow-sm',
  'focus:ring-1 focus:ring-gray-400/70 focus:ring-offset-0',
  'focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0',
  'data-[state=open]:border-gray-400/80 data-[state=open]:bg-white data-[state=open]:shadow-sm',
  'disabled:cursor-not-allowed disabled:opacity-50',
  '[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-gray-400 [&>svg]:opacity-80',
  'dark:border-gray-800/90 dark:bg-gray-900/70 dark:text-gray-100 dark:shadow-none',
  'dark:hover:border-gray-700/90 dark:hover:bg-gray-900/90',
  'dark:focus:border-gray-700 dark:focus:ring-gray-600/80 dark:focus-visible:border-gray-700 dark:focus-visible:ring-gray-600/80',
  'dark:data-[state=open]:border-gray-600/90 dark:data-[state=open]:bg-gray-900',
  'dark:[&>svg]:text-gray-500'
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
      return 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
    case 'audio':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
    case 'video':
      return 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300'
    case 'pdf':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
    case 'tool':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
    case 'reason':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
    case 'text':
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
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

    return () => {
      cancelled = true
    }
  }, [currentAccount?.id, modelCapabilitySyncKey, updateModel])

  const handleAddModel = () => {
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

  const openEditModal = (model: AccountModel) => {
    setEditingModel(model)
    setEditingModelType(model.type)
    setEditingContextWindowTokens(model.contextWindowTokens ? String(model.contextWindowTokens) : '')
    setEditingModalities(model.modalities?.length ? [...model.modalities] : getDefaultModalitiesForType(model.type))
    setEditingModalitiesDirty(false)
  }

  const toggleEditingModality = (modality: string, checked: boolean) => {
    setEditingModalitiesDirty(true)
    setEditingModalities((prev) => {
      if (checked) {
        return prev.includes(modality) ? prev : [...prev, modality]
      }
      return prev.filter(item => item !== modality)
    })
  }

  const handleSaveModalities = () => {
    if (!currentAccount || !editingModel) {
      return
    }

    const parsedContextWindowTokens = Number.parseInt(editingContextWindowTokens, 10)
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
        <DrawerContent className="max-h-[72vh] border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <DrawerHeader className="px-5 pt-5 pb-3 border-b border-gray-200/80 dark:border-gray-800 text-left">
            <DrawerTitle className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Edit Model
            </DrawerTitle>
            <DrawerDescription className="text-[12px] text-gray-500 dark:text-gray-400">
              {editingModel ? `${editingModel.label} · ${editingModel.id}` : ''}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                Model Type
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
                <SelectTrigger className={cn(MODEL_TYPE_SELECT_TRIGGER_CLASSNAME, 'h-9')}>
                  <SelectValue placeholder="Select model type" />
                </SelectTrigger>
                <SelectContent className="bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg backdrop-blur font-medium">
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
              <Label className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                Context Window Tokens
              </Label>
              <Input
                type="number"
                min={1}
                value={editingContextWindowTokens}
                onChange={(event) => setEditingContextWindowTokens(event.target.value)}
                placeholder="128000"
                className={cn(settingsInputClassName, 'h-9 text-[12.5px] bg-white dark:bg-gray-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                Modalities
              </Label>
              <div className="grid grid-cols-2 gap-2">
              {MODALITY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                    editingModalities.includes(option.value)
                      ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800/80'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                >
                  <Checkbox
                    checked={editingModalities.includes(option.value)}
                    onCheckedChange={(checked) => toggleEditingModality(option.value, checked === true)}
                  />
                  <div className="min-w-0">
                    <Label className="text-[12.5px] font-medium text-gray-800 dark:text-gray-200 cursor-pointer">
                      {option.label}
                    </Label>
                  </div>
                </label>
              ))}
              </div>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Use modalities to describe what this model can handle, such as text, image, audio, or video.
            </p>
          </div>

          <DrawerFooter className="px-5 py-4 border-t border-gray-200/80 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60 flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingModel(undefined)
                setEditingContextWindowTokens('')
                setEditingModalitiesDirty(false)
              }}
              className={cn(settingsOutlineButtonClassName, 'h-9 flex-1 justify-center text-[12px]')}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveModalities}
              className={cn(settingsPrimaryButtonClassName, 'h-9 flex-1 justify-center text-[12px]')}
            >
              Save
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className='flex items-center gap-3 px-2 py-2 border-b border-gray-200/70 dark:border-gray-700/60 bg-gray-50/40 dark:bg-gray-900/20 shrink-0'>
        <h3 className='text-xs font-semibold tracking-tight text-gray-900 dark:text-gray-100 shrink-0'>Models</h3>
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
            className='space-x-0.5 text-[11px] tracking-tight text-gray-500 dark:text-gray-400'
          >
            <i className="ri-download-cloud-line"></i>
            <span>Fetch Models</span>
          </Button>
        </div>
      </div>

      {/* ── Add row ──────────────────────────────────────────── */}
      <div
        className='grid shrink-0 border-b border-gray-200/80 bg-gray-50/75 dark:border-gray-700/70 dark:bg-gray-900/35 py-2 px-2 space-x-2'
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
            <SelectContent className="bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-xs backdrop-blur font-medium">
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
                  'grid border-b border-gray-100 dark:border-gray-700/60',
                  'hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors duration-150',
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
                          className='truncate text-[12.5px] font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150'
                          onClick={_ => onModelTableCellClick(m.label)}
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
                          className='truncate text-[11px] text-gray-500 dark:text-gray-400 font-mono cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-150'
                          onClick={_ => onModelTableCellClick(m.id)}
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
                        <span className='text-[10px] text-gray-400 dark:text-gray-500'>
                          No modalities
                        </span>
                      )}
                    </div>
                    {m.contextWindowTokens ? (
                      <p className='text-[10px] text-gray-400 dark:text-gray-500 font-mono'>
                        ctx {m.contextWindowTokens.toLocaleString()} tokens
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className='px-4 py-2.5 flex items-center justify-center'>
                  <Badge variant="secondary" className='text-[9.5px] font-medium uppercase px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-0'>
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
                        ? 'bg-gray-800 dark:bg-gray-200'
                        : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-[14px] w-[14px] rounded-full shadow-sm',
                        'transition-transform duration-200 ease-in-out',
                        'mt-[2px]',
                        m.enabled !== false
                          ? 'translate-x-[14px] bg-white dark:bg-gray-900'
                          : 'translate-x-[2px] bg-white dark:bg-gray-400'
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
                    <div className='w-8 border-t border-gray-200 dark:border-gray-700' />
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
            icon={<i className={`${!currentAccount || currentAccount.models.length === 0 ? 'ri-inbox-line' : 'ri-search-line'} text-[18px] text-gray-400 dark:text-gray-500`} />}
            title={!currentAccount || currentAccount.models.length === 0 ? 'No models yet' : 'No models match'}
            description={!currentAccount || currentAccount.models.length === 0 ? 'Add a model using the form above' : 'Try a different keyword'}
            className="py-10"
          />
        )}
      </div>

    </div>
  )
}
