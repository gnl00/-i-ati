import React, { useMemo, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
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
const GRID_COLS = '28fr 35fr 13fr 13fr 11fr'

const thClass = 'px-4 py-2 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center'

export const ProviderModelsList: React.FC<ProviderModelsListProps> = ({
  selectedProviderId,
  currentAccount,
  onModelTableCellClick,
  onOpenFetchModels,
  isFetchDisabled,
  ensureAccountForProvider
}) => {
  const { addModel, removeModel, toggleModelEnabled } = useAppConfigStore()
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('')
  const [nextAddModelLabel, setNextAddModelLabel] = useState<string>('')
  const [nextAddModelValue, setNextAddModelValue] = useState<string>('')
  const [nextAddModelType, setNextAddModelType] = useState<string>('llm')

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
      enabled: true
    }
    addModel(account.id, newModel)
    setNextAddModelLabel('')
    setNextAddModelValue('')
    setNextAddModelType('llm')
  }

  return (
    <div className='flex-1 min-h-0 flex flex-col overflow-hidden'>

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
                'focus-visible:ring-transparent focus-visible:ring-offset-0',
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

      {/* ── Column headers ───────────────────────────────────── */}
      <div
        className='grid shrink-0 bg-gray-50/40 dark:bg-gray-900/20 border-b border-gray-200 dark:border-gray-700'
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div className={thClass}>Name</div>
        <div className={thClass}>Model ID</div>
        <div className={cn(thClass, 'justify-center')}>Type</div>
        <div className={cn(thClass, 'justify-center')}>Status</div>
        <div className={cn(thClass, 'justify-center')}>Action</div>
      </div>

      {/* ── Add row ──────────────────────────────────────────── */}
      <div
        className='grid shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors duration-150'
        style={{ gridTemplateColumns: GRID_COLS }}
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
        {/* Type + Status columns merged */}
        <div className='px-4 py-2' style={{ gridColumn: 'span 2' }}>
          <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
            <SelectTrigger
              className={cn(
                'h-8 text-[12.5px]',
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
                <SelectItem value="t2i" className='text-[11px] tracking-tight'>T2I</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className='px-4 py-2 flex items-center justify-center'>
          <button
            onClick={handleAddModel}
            className='h-7 px-2.5 flex items-center gap-1 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10'
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
            {filteredModels.map((m, idx) => (
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
                <div className='px-4 py-2.5 min-w-0'>
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
                </div>
                <div className='px-4 py-2.5 min-w-0'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p
                        className='truncate text-[12px] text-gray-500 dark:text-gray-400 font-mono cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-150'
                        onClick={_ => onModelTableCellClick(m.id)}
                      >
                        {m.id}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent><p>{m.id}</p></TooltipContent>
                  </Tooltip>
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
                  <button
                    onClick={() => {
                      if (!currentAccount) return
                      removeModel(currentAccount.id, m.id)
                    }}
                    className='inline-flex items-center justify-center p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors duration-150'
                    title="Remove model"
                  >
                    <i className="ri-delete-bin-line text-[13px]" />
                  </button>
                </div>
              </div>
            ))}
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
