import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import {
  invokeCheckIsDirectory,
  invokeKnowledgebaseClear,
  invokeKnowledgebaseReindex,
  invokeKnowledgebaseSearch,
  invokeKnowledgebaseStats,
  invokeKnowledgebaseStatus,
  invokeOpenPath,
  invokeSelectDirectory
} from '@renderer/invoker/ipcInvoker'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { AlertCircle, BookOpen, Database, FileText, FolderOpen, LoaderCircle, RefreshCw, Search, Trash2 } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface KnowledgebaseManagerProps {
  enabled: boolean
  setEnabled: (value: boolean) => void
  folders: string[]
  setFolders: (value: string[]) => void
  retrievalMode: KnowledgebaseRetrievalMode
  setRetrievalMode: (value: KnowledgebaseRetrievalMode) => void
  autoIndexOnStartup: boolean
  setAutoIndexOnStartup: (value: boolean) => void
  chunkSize: number
  setChunkSize: (value: number) => void
  chunkOverlap: number
  setChunkOverlap: (value: number) => void
  maxResults: number
  setMaxResults: (value: number) => void
}

type FolderHealthState = 'checking' | 'ready' | 'invalid'
type KnowledgebaseRuntimeState = 'idle' | 'scanning' | 'chunking' | 'embedding' | 'completed' | 'failed'

type KnowledgebaseRuntimeStatus = {
  state: KnowledgebaseRuntimeState
  totalFiles: number
  processedFiles: number
  totalChunks: number
  processedChunks: number
  message?: string
  updatedAt: number
}

type KnowledgebaseRuntimeStats = {
  documentCount: number
  chunkCount: number
  indexedDocumentCount: number
  lastIndexedAt?: number
}

type KnowledgebaseSearchResult = {
  chunk_id: string
  document_id: string
  file_path: string
  file_name: string
  folder_path: string
  ext: string
  text: string
  chunk_index: number
  score: number
  similarity: number
  char_start: number
  char_end: number
  token_estimate: number
}

const getFolderDisplayParts = (folder: string): { parent?: string; name: string } => {
  const segments = folder.split(/[\\/]/).filter(Boolean)

  if (segments.length === 0) {
    return { name: folder }
  }

  if (segments.length === 1) {
    return { name: segments[0] }
  }

  return {
    parent: segments[segments.length - 2],
    name: segments[segments.length - 1]
  }
}

const clampNumber = (value: number, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, value))
}

const formatDateTime = (timestamp?: number): string => {
  if (!timestamp) {
    return 'Never'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp))
  } catch {
    return 'Never'
  }
}

const formatScore = (value: number): string => {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000'
}

const neutralActionButtonClass = 'h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-[0.97] transition-all duration-150 disabled:opacity-60'
const neutralCompactButtonClass = 'h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-[0.97] transition-all duration-150 disabled:opacity-60'
const dangerActionButtonClass = 'h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-[0.97] transition-all duration-150 disabled:opacity-60'

const getStatusPresentation = (state: KnowledgebaseRuntimeState): {
  label: string
  badgeClassName: string
  toneClassName: string
} => {
  switch (state) {
    case 'scanning':
      return {
        label: 'Scanning',
        badgeClassName: 'text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800',
        toneClassName: 'text-sky-600 dark:text-sky-400'
      }
    case 'chunking':
      return {
        label: 'Chunking',
        badgeClassName: 'text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800',
        toneClassName: 'text-violet-600 dark:text-violet-400'
      }
    case 'embedding':
      return {
        label: 'Embedding',
        badgeClassName: 'text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
        toneClassName: 'text-amber-600 dark:text-amber-400'
      }
    case 'completed':
      return {
        label: 'Completed',
        badgeClassName: 'text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
        toneClassName: 'text-emerald-600 dark:text-emerald-400'
      }
    case 'failed':
      return {
        label: 'Failed',
        badgeClassName: 'text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
        toneClassName: 'text-rose-600 dark:text-rose-400'
      }
    case 'idle':
    default:
      return {
        label: 'Idle',
        badgeClassName: 'text-slate-600 border-slate-200 bg-slate-50 dark:bg-slate-900/20 dark:text-slate-300 dark:border-slate-700',
        toneClassName: 'text-slate-600 dark:text-slate-300'
      }
  }
}

const KnowledgebaseManager: React.FC<KnowledgebaseManagerProps> = ({
  enabled,
  setEnabled,
  folders,
  setFolders,
  retrievalMode,
  setRetrievalMode,
  autoIndexOnStartup,
  chunkSize,
  setChunkSize,
  chunkOverlap,
  setChunkOverlap,
  maxResults,
  setMaxResults
}) => {
  const { appConfig } = useAppConfigStore()
  const [folderHealth, setFolderHealth] = useState<Record<string, FolderHealthState>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [runtimeRefreshing, setRuntimeRefreshing] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<KnowledgebaseSearchResult[]>([])
  const [searchMessage, setSearchMessage] = useState<string>()
  const [runtimeStatus, setRuntimeStatus] = useState<KnowledgebaseRuntimeStatus>({
    state: 'idle',
    totalFiles: 0,
    processedFiles: 0,
    totalChunks: 0,
    processedChunks: 0,
    updatedAt: 0
  })
  const [runtimeStats, setRuntimeStats] = useState<KnowledgebaseRuntimeStats>({
    documentCount: 0,
    chunkCount: 0,
    indexedDocumentCount: 0
  })

  const savedKnowledgebase = appConfig?.knowledgebase
  const hasUnsavedConfig = enabled !== (savedKnowledgebase?.enabled ?? false)
    || retrievalMode !== (savedKnowledgebase?.retrievalMode ?? 'tool-first')
    || autoIndexOnStartup !== (savedKnowledgebase?.autoIndexOnStartup ?? true)
    || chunkSize !== (savedKnowledgebase?.chunkSize ?? 1200)
    || chunkOverlap !== (savedKnowledgebase?.chunkOverlap ?? 200)
    || maxResults !== (savedKnowledgebase?.maxResults ?? 8)
    || JSON.stringify(folders) !== JSON.stringify(savedKnowledgebase?.folders ?? [])

  const indexingActive = runtimeStatus.state === 'scanning'
    || runtimeStatus.state === 'chunking'
    || runtimeStatus.state === 'embedding'
  const savedFoldersCount = savedKnowledgebase?.folders?.length ?? 0
  const statusPresentation = getStatusPresentation(runtimeStatus.state)

  const validFoldersCount = useMemo(() => {
    return folders.filter(folder => folderHealth[folder] === 'ready').length
  }, [folderHealth, folders])

  const invalidFoldersCount = useMemo(() => {
    return folders.filter(folder => folderHealth[folder] === 'invalid').length
  }, [folderHealth, folders])

  const validateFolders = async (targetFolders: string[]): Promise<Record<string, FolderHealthState>> => {
    if (targetFolders.length === 0) {
      setFolderHealth({})
      return {}
    }

    setFolderHealth(current => {
      const next: Record<string, FolderHealthState> = {}
      targetFolders.forEach(folder => {
        next[folder] = current[folder] === 'ready' ? 'ready' : 'checking'
      })
      return next
    })

    const results = await Promise.allSettled(targetFolders.map(folder => invokeCheckIsDirectory(folder)))
    const nextHealth: Record<string, FolderHealthState> = {}

    results.forEach((result, index) => {
      const folder = targetFolders[index]
      if (result.status === 'fulfilled' && result.value.success && result.value.isDirectory) {
        nextHealth[folder] = 'ready'
        return
      }
      nextHealth[folder] = 'invalid'
    })

    setFolderHealth(nextHealth)
    return nextHealth
  }

  useEffect(() => {
    void validateFolders(folders)
  }, [folders])

  useEffect(() => {
    let disposed = false

    const refreshRuntimeState = async (): Promise<void> => {
      const [status, stats] = await Promise.all([
        invokeKnowledgebaseStatus(),
        invokeKnowledgebaseStats()
      ])

      if (disposed) {
        return
      }

      setRuntimeStatus(status)
      setRuntimeStats(stats)
      setRuntimeLoading(false)
    }

    void refreshRuntimeState().catch(() => {
      if (!disposed) {
        setRuntimeLoading(false)
      }
    })

    return () => {
      disposed = true
    }
  }, [savedKnowledgebase?.enabled, savedKnowledgebase?.folders, savedKnowledgebase?.chunkSize, savedKnowledgebase?.chunkOverlap, savedKnowledgebase?.maxResults])

  useEffect(() => {
    if (!indexingActive) {
      return
    }

    const timer = window.setInterval(() => {
      void Promise.all([
        invokeKnowledgebaseStatus(),
        invokeKnowledgebaseStats()
      ]).then(([status, stats]) => {
        setRuntimeStatus(status)
        setRuntimeStats(stats)
      }).catch(() => undefined)
    }, 1500)

    return () => window.clearInterval(timer)
  }, [indexingActive])

  const refreshRuntimeState = async (silent = false): Promise<void> => {
    if (!silent) {
      setRuntimeRefreshing(true)
    }

    try {
      const [status, stats] = await Promise.all([
        invokeKnowledgebaseStatus(),
        invokeKnowledgebaseStats()
      ])
      setRuntimeStatus(status)
      setRuntimeStats(stats)
    } finally {
      if (!silent) {
        setRuntimeRefreshing(false)
      }
    }
  }

  const buildEffectiveKnowledgebaseConfig = (): KnowledgebaseConfig => {
    return {
      ...(savedKnowledgebase || {}),
      enabled,
      folders,
      retrievalMode,
      autoIndexOnStartup,
      chunkSize,
      chunkOverlap,
      maxResults
    }
  }

  const requireIndexableConfig = (config: KnowledgebaseConfig): boolean => {
    if (!(config.enabled ?? false)) {
      toast.warning('Enable knowledge base before indexing')
      return false
    }

    if ((config.folders?.length ?? 0) === 0) {
      toast.warning('Add at least one knowledge source folder')
      return false
    }

    return true
  }

  const requireSearchableConfig = (): boolean => {
    if (hasUnsavedConfig) {
      toast.warning('Save knowledge base settings before testing recall')
      return false
    }

    if (!requireIndexableConfig(savedKnowledgebase || {})) {
      return false
    }

    if (runtimeStats.chunkCount <= 0 && runtimeStats.indexedDocumentCount <= 0) {
      toast.warning('Run indexing before testing recall')
      return false
    }

    return true
  }

  const handleAddFolder = async (): Promise<void> => {
    const result = await invokeSelectDirectory()
    if (!result.success || !result.path) {
      return
    }

    if (folders.includes(result.path)) {
      toast.message('Knowledge source already added')
      return
    }

    setFolders([...folders, result.path])
  }

  const handleRemoveFolder = (folder: string): void => {
    setFolders(folders.filter(item => item !== folder))
  }

  const handleOpenFolder = async (folder: string): Promise<void> => {
    const result = await invokeOpenPath(folder)
    if (!result.success) {
      toast.error(result.error || 'Failed to open folder')
      return
    }
    toast.success('Path opened')
  }

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const nextHealth = await validateFolders(folders)
      if (folders.length === 0) {
        toast.message('No knowledge sources configured')
        return
      }

      const invalidCount = folders.filter(folder => nextHealth[folder] === 'invalid').length
      if (invalidCount > 0) {
        toast.warning(`Found ${invalidCount} unavailable source${invalidCount > 1 ? 's' : ''}`)
        return
      }

      toast.success('Knowledge sources validated')
    } finally {
      setRefreshing(false)
    }
  }

  const handleRunIndex = async (force: boolean): Promise<void> => {
    const configOverride = buildEffectiveKnowledgebaseConfig()
    if (!requireIndexableConfig(configOverride)) {
      return
    }

    setReindexing(true)
    try {
      await invokeKnowledgebaseReindex({
        force,
        configOverride
      })
      await refreshRuntimeState(true)
      toast.success(force ? 'Knowledge base rebuild completed' : 'Knowledge base indexing completed')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || 'Failed to run knowledge base indexing')
    } finally {
      setReindexing(false)
    }
  }

  const handleClearIndex = async (): Promise<void> => {
    setClearing(true)
    try {
      await invokeKnowledgebaseClear()
      await refreshRuntimeState(true)
      toast.success('Knowledge base index cleared')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || 'Failed to clear knowledge base index')
    } finally {
      setClearing(false)
    }
  }

  const executeSearch = async (rawQuery?: string): Promise<void> => {
    const query = (rawQuery ?? searchQuery).trim()
    if (!query) {
      toast.warning('Enter a query to test recall')
      return
    }

    if (!requireSearchableConfig()) {
      return
    }

    setSearching(true)
    try {
      const result = await invokeKnowledgebaseSearch({
        query,
        localized_query: query,
        top_k: savedKnowledgebase?.maxResults ?? 8,
        folders: savedKnowledgebase?.folders
      })

      if (!result.success) {
        setSearchResults([])
        setSearchMessage(result.message || 'Knowledge base search failed')
        toast.error(result.message || 'Knowledge base search failed')
        return
      }

      setSearchResults(result.results)
      setSearchMessage(result.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSearchResults([])
      setSearchMessage(message || 'Knowledge base search failed')
      toast.error(message || 'Knowledge base search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSearch = async (): Promise<void> => {
    await executeSearch()
  }

  return (
    <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
      <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent'>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4 flex items-start gap-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="toggle-knowledgebase" className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Knowledge Base
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                  RAG
                </Badge>
                <Badge variant="outline" className={`select-none text-[10px] h-5 px-1.5 font-normal ${statusPresentation.badgeClassName}`}>
                  {statusPresentation.label}
                </Badge>
                {hasUnsavedConfig && (
                  <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                    Unsaved Config
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Configure local knowledge sources for future retrieval, grounding, and problem diagnosis workflows.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              id="toggle-knowledgebase"
              className="data-[state=checked]:bg-amber-500 mt-0.5 shrink-0"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap px-4 pb-2">
                <button
                  onClick={() => void refreshRuntimeState()}
                  className={neutralActionButtonClass}
                  disabled={runtimeLoading || runtimeRefreshing}
                  title='Refresh status and statistics from the current knowledge base index'
                  aria-label='Refresh knowledge base status'
                >
                  {runtimeRefreshing ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refresh
                </button>
                <button
                  onClick={() => void handleRunIndex(false)}
                  className={neutralActionButtonClass}
                  disabled={reindexing || clearing || indexingActive}
                  title='Incrementally index changed files and remove deleted files from the current sources'
                  aria-label='Incrementally reindex knowledge base'
                >
                  {(reindexing && !indexingActive) ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Reindex
                </button>
                <button
                  onClick={() => void handleRunIndex(true)}
                  className={neutralActionButtonClass}
                  disabled={reindexing || clearing || indexingActive}
                  title='Force a full rebuild of all indexed files from the current sources'
                  aria-label='Fully rebuild knowledge base index'
                >
                  <Database className="w-3.5 h-3.5" />
                  Rebuild
                </button>
                <button
                  onClick={() => void handleClearIndex()}
                  className={dangerActionButtonClass}
                  disabled={clearing || indexingActive}
                  title='Delete all indexed knowledge base documents and chunks'
                  aria-label='Clear knowledge base index'
                >
                  {clearing ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Clear
                </button>
          </div>

          <div className="bg-gray-50/40 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700/50 px-4 py-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Sources</p>
                <p className="mt-1 text-[18px] font-semibold text-gray-900 dark:text-gray-100">{folders.length}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Ready / Unavailable</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[18px] font-semibold text-emerald-600 dark:text-emerald-400">{validFoldersCount}</span>
                  <span className="text-[12px] text-gray-400 dark:text-gray-500">/</span>
                  <span className="text-[18px] font-semibold text-rose-600 dark:text-rose-400">{invalidFoldersCount}</span>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Files</p>
                <p className="mt-1 text-[18px] font-semibold text-gray-900 dark:text-gray-100">{runtimeStats.documentCount}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Chunks</p>
                <p className="mt-1 text-[18px] font-semibold text-gray-900 dark:text-gray-100">{runtimeStats.chunkCount}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-50 dark:border-gray-700 bg-white/90 dark:bg-gray-800/70 px-2 py-3 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {runtimeStatus.message || 'Knowledge base runtime is ready'} · Last update: {formatDateTime(runtimeStatus.updatedAt)} · Last indexed: {formatDateTime(runtimeStats.lastIndexedAt)}
                  </p>
                </div>
                {runtimeStatus.state === 'failed' && (
                  <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
              </div>

              {hasUnsavedConfig && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Current draft differs from saved configuration. Build Index uses the draft values. Recall testing still reflects the latest built index.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Recall Test
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                  SEARCH
                </Badge>
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Search the saved knowledge base index directly from settings to inspect recall quality, file hits, and chunk snippets.
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-3 bg-gray-50/40 dark:bg-gray-900/20 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleSearch()
                    }
                  }}
                  placeholder='Search knowledge base snippets, errors, modules, APIs...'
                  className='h-9 pl-9 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus-visible:ring-transparent focus-visible:ring-offset-0'
                />
              </div>
              <button
                onClick={() => void handleSearch()}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10 disabled:opacity-60"
                disabled={searching}
              >
                {searching ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Search
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400 dark:text-gray-500">
              <span>Saved folders: {savedFoldersCount} · Indexed docs: {runtimeStats.indexedDocumentCount} · Chunks: {runtimeStats.chunkCount}</span>
              <span>Top K: {savedKnowledgebase?.maxResults ?? 8}</span>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/60">
              {searchQuery.trim().length === 0 && searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">Enter a query to inspect retrieval results</p>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">This panel shows matched files, scores, and retrieved chunk excerpts.</p>
                </div>
              ) : searching ? (
                <div className="px-4 py-8 text-center">
                  <LoaderCircle className="w-4 h-4 animate-spin mx-auto text-gray-400 dark:text-gray-500" />
                  <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">Searching indexed chunks...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">{searchMessage || 'No recall result found'}</p>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Try a more specific phrase, a scope name, or reindex after saving knowledge base changes.</p>
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  <div className="px-2 pt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    {searchMessage || `Found ${searchResults.length} recall results`}
                  </div>
                  {searchResults.map((result) => (
                    <div key={result.chunk_id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20 px-3 py-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[12.5px] font-medium text-gray-900 dark:text-gray-100 truncate">{result.file_name}</p>
                            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800">
                              {result.ext || 'file'}
                            </Badge>
                            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                              score {formatScore(result.score)}
                            </Badge>
                            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                              sim {formatScore(result.similarity)}
                            </Badge>
                          </div>

                          <p className="text-[11px] text-gray-500 dark:text-gray-400 break-all">{result.file_path}</p>

                          <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
                            <span>chunk #{result.chunk_index}</span>
                            <span>range {result.char_start}-{result.char_end}</span>
                            <span>{result.token_estimate} tokens</span>
                          </div>

                          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5">
                            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 font-mono">
                              {result.text}
                            </pre>
                          </div>
                        </div>

                        <button
                          onClick={() => void handleOpenFolder(result.file_path)}
                          className="h-8 w-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 flex items-center justify-center transition-colors shrink-0"
                          aria-label={`Open ${result.file_path}`}
                          title="Open file"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Knowledge Sources
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800">
                  PATH
                </Badge>
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Add one or more directories as source roots. The current phase stores and validates sources for later indexing work.
              </p>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-3 flex items-center justify-between gap-3 bg-gray-50/40 dark:bg-gray-900/20">
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Source Directories</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleRunIndex(false)}
                className={neutralCompactButtonClass}
                disabled={reindexing || clearing || indexingActive}
                title='Incrementally index changed files and remove deleted files from the current sources'
                aria-label='Build knowledge base index'
              >
                {(reindexing && !indexingActive) ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                Build Index
              </button>
              <button
                onClick={() => void handleRefresh()}
                className={neutralCompactButtonClass}
                title='Validate current source directories and refresh their availability status'
                aria-label='Validate knowledge base source directories'
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Validate
              </button>
              <button
                onClick={() => void handleAddFolder()}
                className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Add Source
              </button>
            </div>
          </div>
          <div className="px-4 py-3 space-y-2">
            {folders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center">
                <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No knowledge sources configured</p>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Add a folder to prepare local documents for future indexing.</p>
              </div>
            ) : (
              folders.map(folder => {
                const parts = getFolderDisplayParts(folder)
                const healthState = folderHealth[folder] || 'checking'
                const healthLabel = healthState === 'ready'
                  ? 'Ready'
                  : healthState === 'invalid'
                    ? 'Unavailable'
                    : 'Checking'
                const healthClassName = healthState === 'ready'
                  ? 'text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                  : healthState === 'invalid'
                    ? 'text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800'
                    : 'text-slate-600 border-slate-200 bg-slate-50 dark:bg-slate-900/20 dark:text-slate-300 dark:border-slate-700'

                return (
                  <div key={folder} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 px-3 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-[12.5px] font-medium text-gray-800 dark:text-gray-100 truncate">{parts.name}</p>
                        <Badge variant="outline" className={`select-none text-[10px] h-5 px-1.5 font-normal ${healthClassName}`}>
                          {healthLabel}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {parts.parent ? `${parts.parent} / ${parts.name}` : folder}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 truncate">{folder}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void handleOpenFolder(folder)}
                        className="h-8 w-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                        aria-label={`Open ${folder}`}
                        title="Open folder"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveFolder(folder)}
                        className="h-8 w-8 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                        aria-label={`Remove ${folder}`}
                        title="Remove source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Index Parameters
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                  INDEX
                </Badge>
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Tune chunking and retrieval defaults used by manual knowledge base indexing and search.
              </p>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-1">
            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800/60">
              <div className="flex-1">
                <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Retrieval Mode</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Choose whether chat uses automatic snippet injection, tool-directed retrieval, or disables knowledge base retrieval during chat preparation.</p>
              </div>
              <Select
                value={retrievalMode}
                onValueChange={(value) => setRetrievalMode(value as KnowledgebaseRetrievalMode)}
              >
                <SelectTrigger
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="h-9 w-[180px] text-[12px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                >
                  <SelectValue placeholder="Select retrieval mode" />
                </SelectTrigger>
                <SelectContent className="bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg backdrop-blur font-medium">
                  <SelectItem value="tool-first" className='text-[11px] tracking-tight'>Tool First</SelectItem>
                  <SelectItem value="auto" className='text-[11px] tracking-tight'>Auto Inject</SelectItem>
                  <SelectItem value="off" className='text-[11px] tracking-tight'>Off</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800/60">
              <div className="flex-1">
                <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Chunk Size</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Target characters per chunk for future document segmentation.</p>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 shrink-0">
                <Input
                  type="number"
                  min={200}
                  max={4000}
                  value={chunkSize}
                  onChange={(e) => {
                    const value = clampNumber(parseInt(e.target.value, 10), 1200, 200, 4000)
                    setChunkSize(value)
                  }}
                  className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-20 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs transition-all focus:w-24 font-mono font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                />
                <span className="text-xs font-medium text-gray-400 pr-2">chars</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800/60">
              <div className="flex-1">
                <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Chunk Overlap</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Shared characters between adjacent chunks to preserve local context.</p>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 shrink-0">
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={chunkOverlap}
                  onChange={(e) => {
                    const value = clampNumber(parseInt(e.target.value, 10), 200, 0, 1000)
                    setChunkOverlap(value)
                  }}
                  className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-20 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs transition-all focus:w-24 font-mono font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                />
                <span className="text-xs font-medium text-gray-400 pr-2">chars</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex-1">
                <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Max Results</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Default upper bound for future retrieval result count.</p>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 shrink-0">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={maxResults}
                  onChange={(e) => {
                    const value = clampNumber(parseInt(e.target.value, 10), 8, 1, 20)
                    setMaxResults(value)
                  }}
                  className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-20 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs transition-all focus:w-24 font-mono font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                />
                <span className="text-xs font-medium text-gray-400 pr-2">items</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KnowledgebaseManager
