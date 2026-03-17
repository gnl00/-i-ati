import React, { useMemo, useState } from 'react'
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
import { Search } from 'lucide-react'
import { useAppConfigStore } from '@renderer/store/appConfig'
import InlineDeleteConfirm from '@renderer/components/settings/common/InlineDeleteConfirm'
import { toast } from 'sonner'

type ProviderModelsListProps = {
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

const MODALITY_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
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
    case 'tool':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
    case 'reason':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
    case 'text':
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
  }
}

export const ProviderModelsList: React.FC<ProviderModelsListProps> = ({
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
  const [editingModalities, setEditingModalities] = useState<string[]>([])
  const [editingModalitiesDirty, setEditingModalitiesDirty] = useState(false)

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

    updateModel(currentAccount.id, editingModel.id, {
      type: editingModelType,
      modalities: editingModalities
    })
    setEditingModel(undefined)
    setEditingModalitiesDirty(false)
  }

  return (
    <div className='flex-1 min-h-0 flex flex-col overflow-hidden'>

      <Drawer open={!!editingModel} onOpenChange={(open) => !open && setEditingModel(undefined)}>
        <DrawerContent className="max-h-[72vh] border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <DrawerHeader className="px-5 pt-5 pb-3 border-b border-gray-200/80 dark:border-gray-800 text-left">
            <DrawerTitle className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Edit Model Modalities
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
                <SelectTrigger className="h-9 text-[12.5px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
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
                setEditingModalitiesDirty(false)
              }}
              className="h-9 flex-1 rounded-md text-[12px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveModalities}
              className="h-9 flex-1 rounded-md text-[12px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 transition-colors"
            >
              Save
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className='flex justify-between items-center gap-3 px-4 py-2.5 border-b border-gray-200/70 dark:border-gray-700/60 bg-gray-50/40 dark:bg-gray-900/20 shrink-0'>
        <h3 className='text-[13.5px] font-semibold tracking-tight text-gray-900 dark:text-gray-100 shrink-0'>Models</h3>
        <div className='flex-1 flex items-center'>
          <div className='relative w-full max-w-[240px]'>
            <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
            <Input
              value={modelSearchQuery}
              onChange={e => setModelSearchQuery(e.target.value)}
              placeholder="Search models..."
              className={cn(
                'h-7 pl-8 pr-3 text-[12px]',
                'bg-white/80 dark:bg-gray-800/60',
                'border border-gray-200 dark:border-gray-700',
                'rounded-lg',
                'text-gray-700 dark:text-gray-200',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'focus-visible:ring-2 focus-visible:ring-gray-300/80 dark:focus-visible:ring-gray-600/80 focus-visible:ring-offset-0',
                'focus-visible:border-gray-400 dark:focus-visible:border-gray-500',
              )}
            />
          </div>
        </div>
        <button
          onClick={onOpenFetchModels}
          disabled={isFetchDisabled}
          className='h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10 disabled:opacity-40 disabled:pointer-events-none shrink-0'
        >
          <i className="ri-download-cloud-line text-[12px]"></i>
          Fetch Models
        </button>
      </div>

      {/* ── Add row ──────────────────────────────────────────── */}
      <div
        className='grid shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors duration-150'
        style={{ gridTemplateColumns: ADD_ROW_GRID_COLS }}
      >
        <div className='px-3 py-2'>
          <Input
            className={cn(
              'h-8 text-[12.5px]',
              'border-0 border-b border-gray-300 dark:border-gray-600',
              'rounded-none px-2',
              'bg-transparent',
              'text-gray-700 dark:text-gray-200',
              'placeholder:text-[11px] placeholder:tracking-tight placeholder:text-gray-400 dark:placeholder:text-gray-500',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'focus-visible:border-b-gray-500 dark:focus-visible:border-b-gray-400',
              'transition-colors duration-150 shadow-none'
            )}
            value={nextAddModelLabel}
            onChange={e => setNextAddModelLabel(e.target.value)}
            placeholder="Model Name"
          />
        </div>
        <div className='px-3 py-2'>
          <Input
            className={cn(
              'h-8 text-[12.5px]',
              'border-0 border-b border-gray-300 dark:border-gray-600',
              'rounded-none px-2',
              'bg-transparent',
              'text-gray-700 dark:text-gray-200',
              'placeholder:text-[11px] placeholder:tracking-tight placeholder:text-gray-400 dark:placeholder:text-gray-500',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'focus-visible:border-b-gray-500 dark:focus-visible:border-b-gray-400',
              'transition-colors duration-150 shadow-none'
            )}
            value={nextAddModelValue}
            onChange={e => setNextAddModelValue(e.target.value)}
            placeholder="Model ID"
          />
        </div>
        <div className='px-4 py-2.5 flex items-center justify-center'>
          <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
            <SelectTrigger
              className={cn(
                'h-8 w-full text-[12.5px]',
                'border-0 border-b border-gray-300 dark:border-gray-600',
                'rounded-none px-2',
                'bg-transparent',
                'text-gray-700 dark:text-gray-200',
                'focus:ring-0 focus:ring-offset-0',
                'focus:border-b-gray-500 dark:focus:border-b-gray-400',
                'transition-colors duration-150 shadow-none'
              )}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-white/20 rounded-lg shadow-xs backdrop-blur-lg font-medium">
              <SelectGroup>
                <SelectItem value="llm" className='text-[11px] tracking-tight'>LLM</SelectItem>
                <SelectItem value="vlm" className='text-[11px] tracking-tight'>VLM</SelectItem>
                <SelectItem value="mllm" className='text-[11px] tracking-tight'>MLLM</SelectItem>
                <SelectItem value="img_gen" className='text-[11px] tracking-tight'>IMG_GEN</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className='px-4 py-2.5 flex items-center justify-center'>
          <button
            onClick={handleAddModel}
            className='h-7 w-full max-w-[84px] px-2.5 flex items-center justify-center gap-1 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10'
          >
            <i className="ri-add-line text-[12px]"></i>
            Add
          </button>
        </div>
      </div>

      {/* ── Scrollable model rows ─────────────────────────────── */}
      <div className='flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent'>
        {filteredModels.length > 0 ? (
          <TooltipProvider>
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
                      <TooltipContent><p>{m.label}</p></TooltipContent>
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
                      <TooltipContent><p>{m.id}</p></TooltipContent>
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
                      className='h-5 px-2 rounded inline-flex items-center gap-1 text-[10.5px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
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
                      idleLabel="Del"
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
          <div className='flex flex-col items-center justify-center gap-1.5 py-10 text-gray-400 dark:text-gray-500'>
            {!currentAccount || currentAccount.models.length === 0 ? (
              <>
                <i className="ri-inbox-line text-[28px] opacity-40"></i>
                <p className='text-[12.5px] font-medium text-gray-500 dark:text-gray-400'>No models yet</p>
                <p className='text-[11.5px]'>Add a model using the form above</p>
              </>
            ) : (
              <>
                <i className="ri-search-line text-[24px] opacity-40"></i>
                <p className='text-[12.5px] font-medium text-gray-500 dark:text-gray-400'>No models match</p>
                <p className='text-[11.5px]'>Try a different keyword</p>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
