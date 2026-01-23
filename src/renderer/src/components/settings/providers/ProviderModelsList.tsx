import React, { useMemo, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
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
import { Search, Trash } from 'lucide-react'
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
    <div className='flex-1 flex justify-between flex-col overflow-hidden bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200/50 dark:border-gray-700/50'>
      <div className='flex justify-between items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'>
        <h3 className='text-sm font-medium flex items-center text-gray-700 dark:text-gray-300'>Models</h3>
        <div className='flex-1 flex items-center'>
          <div className='relative w-full max-w-[260px]'>
            <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400' />
            <Input
              value={modelSearchQuery}
              onChange={e => setModelSearchQuery(e.target.value)}
              placeholder="Search models..."
              className={cn(
                'h-8 pl-8 pr-3 text-xs font-medium',
                'bg-white/80 dark:bg-gray-800/60',
                'border border-gray-200/70 dark:border-gray-700/70',
                'rounded-xl',
                'text-gray-700 dark:text-gray-200',
                'placeholder:text-gray-400',
                'focus-visible:ring-0 focus-visible:ring-offset-0',
                'focus-visible:border-gray-300 dark:focus-visible:border-gray-600'
              )}
            />
          </div>
        </div>
        <Button
          size="xs"
          variant="ghost"
          className={cn(
            'group relative rounded-xl text-[11px] font-semibold tracking-tight',
            'px-3 py-2 h-auto',
            'text-slate-600 dark:text-slate-400',
            'bg-white dark:bg-slate-900',
            'dark:hover:bg-slate-800',
            'hover:text-slate-900 dark:hover:text-slate-100',
            'active:scale-95',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900',
            'disabled:hover:border-slate-300 dark:disabled:hover:border-slate-700',
            'disabled:hover:shadow-xs disabled:hover:text-slate-600 dark:disabled:hover:text-slate-400'
          )}
          onClick={onOpenFetchModels}
          disabled={isFetchDisabled}
        >
          <i className={cn(
            "ri-download-cloud-line mr-1.5 text-sm",
            "transition-all duration-300",
          )}></i>
          Fetch Models
        </Button>
      </div>
      <div className='flex-1 overflow-y-auto scroll-smooth [&>div]:overflow-visible!'>
        <TooltipProvider>
          <Table id="provider-models-table" className='relative'>
            <TableHeader className='sticky top-0 z-10 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xs border-b border-gray-200 dark:border-gray-700'>
              <TableRow className='border-none hover:bg-transparent'>
                <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider'>Name</TableHead>
                <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider'>Model ID</TableHead>
                <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Type</TableHead>
                <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Status</TableHead>
                <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Add New Model Row */}
              <TableRow className='border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors duration-200'>
                <TableCell className='px-3 py-3 w-[40%]'>
                  <div className="relative">
                    <Input
                      className={cn(
                        'h-9 text-sm font-medium',
                        'border-0 border-b-2 border-slate-300 dark:border-slate-600',
                        'rounded-none px-2',
                        'bg-transparent dark:bg-transparent',
                        'text-slate-700 dark:text-slate-200',
                        'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                        'outline-hidden focus:outline-hidden focus-visible:outline-hidden',
                        'focus-visible:ring-0 focus-visible:ring-offset-0',
                        'focus-visible:border-b-blue-500 dark:focus-visible:border-b-blue-400',
                        'transition-all duration-200',
                        'shadow-none focus-visible:shadow-none'
                      )}
                      value={nextAddModelLabel}
                      onChange={e => setNextAddModelLabel(e.target.value)}
                      placeholder="ModelName"
                    />
                  </div>
                </TableCell>
                <TableCell className='px-3 py-3 w-[40%]'>
                  <div className="relative">
                    <Input
                      className={cn(
                        'h-9 text-sm font-medium',
                        'border-0 border-b-2 border-slate-300 dark:border-slate-600',
                        'rounded-none px-2',
                        'bg-transparent dark:bg-transparent',
                        'text-slate-700 dark:text-slate-200',
                        'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                        'outline-hidden focus:outline-hidden focus-visible:outline-hidden',
                        'focus-visible:ring-0 focus-visible:ring-offset-0',
                        'focus-visible:border-b-blue-500 dark:focus-visible:border-b-blue-400',
                        'transition-all duration-200',
                        'shadow-none focus-visible:shadow-none'
                      )}
                      value={nextAddModelValue}
                      onChange={e => setNextAddModelValue(e.target.value)}
                      placeholder="ModelID"
                    />
                  </div>
                </TableCell>
                <TableCell colSpan={2} className='px-4 py-3'>
                  <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
                    <SelectTrigger className={cn(
                      'h-9 text-sm font-medium',
                      'border-0 border-b-2 border-slate-300 dark:border-slate-600',
                      'rounded-none px-2',
                      'bg-transparent dark:bg-transparent',
                      'text-slate-700 dark:text-slate-200',
                      'outline-hidden focus:outline-hidden focus-visible:outline-hidden',
                      'focus:ring-0 focus:ring-offset-0',
                      'focus:border-b-blue-500 dark:focus:border-b-blue-400',
                      'transition-all duration-200',
                      'shadow-none'
                    )}>
                      <SelectValue placeholder="Type" className="placeholder:text-slate-400 dark:placeholder:text-slate-500" />
                    </SelectTrigger>
                    <SelectContent className="bg-white/20 rounded-2xl shadow-xs backdrop-blur-lg text-gray-400 dark:text-gray-300 font-medium tracking-wider">
                      <SelectGroup defaultValue={'llm'}>
                        <SelectItem value="llm" className="rounded-lg">LLM</SelectItem>
                        <SelectItem value="vlm" className="rounded-lg">VLM</SelectItem>
                        <SelectItem value="t2i" className="rounded-lg">T2I</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className='px-4 py-3 text-center'>
                  <Button
                    onClick={handleAddModel}
                    size={'sm'}
                    variant={'default'}
                    className='h-7 px-3 rounded-3xl text-xs transition-transform duration-200 hover:scale-105 active:scale-95'
                  >
                    <i className="ri-add-circle-line mr-1 text-sm"></i>
                    Add
                  </Button>
                </TableCell>
              </TableRow>
              {/* Model List */}
              {filteredModels.map((m, idx) => (
                <TableRow
                  key={idx}
                  style={{
                    animationDelay: `${idx * 40}ms`,
                    animationFillMode: 'both'
                  }}
                  className={cn(
                    'border-b border-gray-200/60 dark:border-gray-700/60 transition-all duration-200 ease-out group/row',
                    'hover:bg-gray-50 dark:hover:bg-gray-700/40',
                    'hover:border-gray-300 dark:hover:border-gray-600',
                    'animate-in fade-in slide-in-from-bottom-1',
                    idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/30 dark:bg-gray-800/40'
                  )}
                >
                  <TableCell className='px-4 py-3 text-left max-w-0'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p
                          className='truncate text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150'
                          onClick={_ => onModelTableCellClick(m.label)}
                        >
                          {m.label}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{m.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className='px-4 py-3 text-left max-w-0'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p
                          className='truncate text-[13px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 transition-colors duration-150'
                          onClick={_ => onModelTableCellClick(m.id)}
                        >
                          {m.id}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{m.id}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className='px-4 py-3 text-center'>
                    <Badge variant="secondary" className='text-[10px] font-medium uppercase px-2 py-0.5'>
                      {m.type}
                    </Badge>
                  </TableCell>
                  <TableCell className='px-4 py-3 text-center'>
                    <div className='inline-flex items-center justify-center'>
                      <Switch
                        className='h-6 transition-all duration-200'
                        checked={m.enabled !== false}
                        onCheckedChange={_checked => {
                          if (!currentAccount) return
                          toggleModelEnabled(currentAccount.id, m.id)
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className='px-4 py-3 text-center'>
                    <button
                      onClick={_ => {
                        if (!currentAccount) return
                        removeModel(currentAccount.id, m.id)
                      }}
                      className='inline-flex items-center justify-center p-1.5 rounded-md text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 hover:scale-110 active:scale-90 group/del'
                      title="Delete model"
                    >
                      <Trash className='w-4 h-4 group-hover/del:animate-[wiggle_0.3s_ease-in-out]' />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {/* Empty State */}
              {currentAccount?.models.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className='px-4 py-12 text-center'>
                    <div className='flex flex-col items-center justify-center text-gray-400 dark:text-gray-500'>
                      <i className="ri-inbox-line text-4xl mb-2 opacity-40"></i>
                      <p className='text-sm'>No models yet</p>
                      <p className='text-xs mt-1'>Add a model using the form above</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {currentAccount?.models.length !== 0 && filteredModels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className='px-4 py-12 text-center'>
                    <div className='flex flex-col items-center justify-center text-gray-400 dark:text-gray-500'>
                      <i className="ri-search-line text-3xl mb-2 opacity-40"></i>
                      <p className='text-sm'>No models match your search</p>
                      <p className='text-xs mt-1'>Try a different keyword</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </div>
  )
}
