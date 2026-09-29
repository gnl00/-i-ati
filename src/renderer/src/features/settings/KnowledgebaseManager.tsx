import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/shared/components/ui/dropdown-menu'
import { Input } from '@renderer/shared/components/ui/input'
import { Label } from '@renderer/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/shared/components/ui/select'
import { Switch } from '@renderer/shared/components/ui/switch'
import {
  invokeCheckIsDirectory,
  invokeKnowledgebaseClear,
  invokeKnowledgebaseReindex,
  invokeKnowledgebaseSearch,
  invokeKnowledgebaseStats,
  invokeKnowledgebaseStatus,
  invokeOpenPath,
  invokeSelectDirectory
} from '@renderer/infrastructure/ipc'
import { cn } from '@renderer/shared/lib/utils'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import {
  AlertCircle,
  BookOpen,
  ChevronRight,
  Database,
  FileText,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import ExpandableSearchInput from './common/ExpandableSearchInput'
import {
  SettingsControlGroup,
  SettingsEmptyState,
  SettingsFieldRow,
  SettingsLoadingState,
  SettingsNotice,
  SettingsPageShell,
  SettingsSection,
  SettingsSectionHeader,
  settingsIconButtonClassName,
  settingsInputClassName,
  settingsOutlineButtonClassName,
  settingsPrimaryButtonClassName,
  settingsSecondaryButtonClassName
} from './common/SettingsLayout'

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
type KnowledgebaseRuntimeState =
  'idle' | 'scanning' | 'chunking' | 'embedding' | 'completed' | 'failed'

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

const clampNumber = (
  value: number,
  fallback: number,
  min: number,
  max: number
): number => {
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

const getStatusPresentation = (
  state: KnowledgebaseRuntimeState
): {
  label: string
  toneClassName: string
} => {
  switch (state) {
    case 'scanning':
      return {
        label: 'Scanning',
        toneClassName: 'text-sky-600 dark:text-sky-400'
      }
    case 'chunking':
      return {
        label: 'Chunking',
        toneClassName: 'text-violet-600 dark:text-violet-400'
      }
    case 'embedding':
      return {
        label: 'Embedding',
        toneClassName: 'text-amber-600 dark:text-amber-400'
      }
    case 'completed':
      return {
        label: 'Completed',
        toneClassName: 'text-emerald-600 dark:text-emerald-400'
      }
    case 'failed':
      return {
        label: 'Failed',
        toneClassName: 'text-rose-600 dark:text-rose-400'
      }
    case 'idle':
    default:
      return {
        label: 'Idle',
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
  const [folderHealth, setFolderHealth] = useState<
    Record<string, FolderHealthState>
  >({})
  const [refreshing, setRefreshing] = useState(false)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<
    KnowledgebaseSearchResult[]
  >([])
  const [searchMessage, setSearchMessage] = useState<string>()
  const [runtimeStatus, setRuntimeStatus] =
    useState<KnowledgebaseRuntimeStatus>({
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
  const hasUnsavedConfig =
    enabled !== (savedKnowledgebase?.enabled ?? false) ||
    retrievalMode !== (savedKnowledgebase?.retrievalMode ?? 'tool-first') ||
    autoIndexOnStartup !== (savedKnowledgebase?.autoIndexOnStartup ?? true) ||
    chunkSize !== (savedKnowledgebase?.chunkSize ?? 1200) ||
    chunkOverlap !== (savedKnowledgebase?.chunkOverlap ?? 200) ||
    maxResults !== (savedKnowledgebase?.maxResults ?? 8) ||
    JSON.stringify(folders) !==
      JSON.stringify(savedKnowledgebase?.folders ?? [])

  const indexingActive =
    runtimeStatus.state === 'scanning' ||
    runtimeStatus.state === 'chunking' ||
    runtimeStatus.state === 'embedding'
  const statusPresentation = getStatusPresentation(runtimeStatus.state)

  const validateFolders = async (
    targetFolders: string[]
  ): Promise<Record<string, FolderHealthState>> => {
    if (targetFolders.length === 0) {
      setFolderHealth({})
      return {}
    }

    setFolderHealth((current) => {
      const next: Record<string, FolderHealthState> = {}
      targetFolders.forEach((folder) => {
        next[folder] = current[folder] === 'ready' ? 'ready' : 'checking'
      })
      return next
    })

    const results = await Promise.allSettled(
      targetFolders.map((folder) => invokeCheckIsDirectory(folder))
    )
    const nextHealth: Record<string, FolderHealthState> = {}

    results.forEach((result, index) => {
      const folder = targetFolders[index]
      if (
        result.status === 'fulfilled' &&
        result.value.success &&
        result.value.isDirectory
      ) {
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

    return (): void => {
      disposed = true
    }
  }, [
    savedKnowledgebase?.enabled,
    savedKnowledgebase?.folders,
    savedKnowledgebase?.chunkSize,
    savedKnowledgebase?.chunkOverlap,
    savedKnowledgebase?.maxResults
  ])

  useEffect(() => {
    if (!indexingActive) {
      return
    }

    const timer = window.setInterval(() => {
      void Promise.all([
        invokeKnowledgebaseStatus(),
        invokeKnowledgebaseStats()
      ])
        .then(([status, stats]) => {
          setRuntimeStatus(status)
          setRuntimeStats(stats)
        })
        .catch(() => undefined)
    }, 1500)

    return (): void => window.clearInterval(timer)
  }, [indexingActive])

  const refreshRuntimeState = async (): Promise<void> => {
    const [status, stats] = await Promise.all([
      invokeKnowledgebaseStatus(),
      invokeKnowledgebaseStats()
    ])
    setRuntimeStatus(status)
    setRuntimeStats(stats)
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

    if (
      runtimeStats.chunkCount <= 0 &&
      runtimeStats.indexedDocumentCount <= 0
    ) {
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
    setFolders(folders.filter((item) => item !== folder))
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

      const invalidCount = folders.filter(
        (folder) => nextHealth[folder] === 'invalid'
      ).length
      if (invalidCount > 0) {
        toast.warning(
          `Found ${invalidCount} unavailable source${invalidCount > 1 ? 's' : ''}`
        )
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
      await refreshRuntimeState()
      toast.success(
        force
          ? 'Knowledge base rebuild completed'
          : 'Knowledge base indexing completed'
      )
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
      await refreshRuntimeState()
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
      setSearchMessage(
        result.message ||
          (result.results.length === 0 ? 'No recall result found' : undefined)
      )
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
    <SettingsPageShell scrollable contentClassName="space-y-2">
      <SettingsSection>
        <SettingsSectionHeader
          title={<Label htmlFor="toggle-knowledgebase">Knowledge Base</Label>}
          actions={
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              id="toggle-knowledgebase"
            />
          }
        />
        <div className="px-4 pb-3">
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500 dark:text-(--app-text-secondary)"
            aria-live="polite"
          >
            {(runtimeLoading ||
              indexingActive ||
              runtimeStatus.state === 'failed') && (
              <span
                className={cn(
                  'flex items-center gap-1.5',
                  statusPresentation.toneClassName
                )}
              >
                {indexingActive && (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                )}
                {runtimeLoading ? 'Loading' : statusPresentation.label}
              </span>
            )}
            <span className="tabular-nums">
              {runtimeStats.documentCount} files
            </span>
            <span className="tabular-nums">
              {runtimeStats.chunkCount} chunks
            </span>
            <span>
              Last indexed: {formatDateTime(runtimeStats.lastIndexedAt)}
            </span>
          </div>
          {(indexingActive || runtimeStatus.state === 'failed') && (
            <SettingsNotice
              tone={runtimeStatus.state === 'failed' ? 'danger' : 'neutral'}
              className="mt-2 flex items-start gap-2"
              role="status"
            >
              {runtimeStatus.state === 'failed' && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                {runtimeStatus.message || statusPresentation.label}
                {indexingActive && (
                  <span className="ml-2 tabular-nums">
                    Files {runtimeStatus.processedFiles}/
                    {runtimeStatus.totalFiles} · Chunks{' '}
                    {runtimeStatus.processedChunks}/{runtimeStatus.totalChunks}
                  </span>
                )}
              </span>
            </SettingsNotice>
          )}
        </div>
        <div className="px-4">
          <SettingsFieldRow
            title="Retrieval Mode"
            className="flex-wrap border-t border-gray-100 dark:border-(--app-border-subtle)"
            control={
              <Select
                value={retrievalMode}
                onValueChange={(value) =>
                  setRetrievalMode(value as KnowledgebaseRetrievalMode)
                }
              >
                <SelectTrigger
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  className={cn(
                    settingsInputClassName,
                    'h-8 w-[180px] text-[12px]'
                  )}
                  aria-label="Retrieval mode"
                >
                  <SelectValue placeholder="Select retrieval mode">
                    {retrievalMode === 'tool-first'
                      ? 'Tool First'
                      : retrievalMode === 'auto'
                        ? 'Auto Inject'
                        : 'Off'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-lg border-gray-200 bg-white font-medium dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body)">
                  <SelectItem
                    value="tool-first"
                    textValue="Tool First"
                    className="text-[11px] tracking-tight dark:focus:bg-(--app-surface-hover) dark:focus:text-(--app-text-primary)"
                  >
                    <span className="inline-flex flex-wrap items-baseline gap-x-2">
                      <span>Tool First</span>
                      <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-secondary)">
                        Search via tool when needed
                      </span>
                    </span>
                  </SelectItem>
                  <SelectItem
                    value="auto"
                    textValue="Auto Inject"
                    className="text-[11px] tracking-tight dark:focus:bg-(--app-surface-hover) dark:focus:text-(--app-text-primary)"
                  >
                    <span className="inline-flex flex-wrap items-baseline gap-x-2">
                      <span>Auto Inject</span>
                      <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-secondary)">
                        Add matching context automatically
                      </span>
                    </span>
                  </SelectItem>
                  <SelectItem
                    value="off"
                    textValue="Off"
                    className="text-[11px] tracking-tight dark:focus:bg-(--app-surface-hover) dark:focus:text-(--app-text-primary)"
                  >
                    Off
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
        <div className="border-t border-gray-100 dark:border-(--app-border-subtle)">
          <SettingsSectionHeader
            title="Knowledge Sources"
            badges={
              <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
                {folders.length} sources
              </span>
            }
            className="items-center"
            actions={
              <>
                <button
                  onClick={() => void handleAddFolder()}
                  className={settingsOutlineButtonClassName}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Add Source
                </button>
                <button
                  onClick={() => void handleRunIndex(false)}
                  className={settingsPrimaryButtonClassName}
                  disabled={reindexing || clearing || indexingActive}
                >
                  {reindexing || indexingActive ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Database className="h-3.5 w-3.5" />
                  )}
                  Update Index
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={settingsIconButtonClassName}
                      aria-label="Index maintenance"
                      title="Index maintenance"
                      disabled={reindexing || clearing || indexingActive}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="rounded-lg border-gray-200 bg-white dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body)"
                  >
                    <DropdownMenuItem
                      className="text-[11px] dark:focus:bg-(--app-surface-hover) dark:focus:text-(--app-text-primary)"
                      disabled={refreshing}
                      onSelect={() => void handleRefresh()}
                    >
                      <RefreshCw className={cn(refreshing && 'animate-spin')} />
                      Validate Sources
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[11px] dark:focus:bg-(--app-surface-hover) dark:focus:text-(--app-text-primary)"
                      onSelect={() => void handleRunIndex(true)}
                    >
                      <Database />
                      Rebuild Index
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[11px] text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:bg-(--app-surface-hover) dark:focus:text-rose-400"
                      onSelect={() => void handleClearIndex()}
                    >
                      <Trash2 />
                      Clear Index
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
          {hasUnsavedConfig && (
            <p className="px-4 pb-3 text-[11px] text-amber-600 dark:text-amber-400">
              Update Index and Rebuild Index use the current draft settings.
              Save settings before testing recall.
            </p>
          )}
          {folders.length === 0 ? (
            <SettingsEmptyState
              icon={<BookOpen className="h-4 w-4" />}
              title="No knowledge sources configured"
              description="Add a folder to index local documents."
              className="px-4 py-6"
            />
          ) : (
            folders.map((folder) => {
              const name = folder.split(/[\\/]/).filter(Boolean).pop() || folder
              const health = folderHealth[folder] || 'checking'
              return (
                <div
                  key={folder}
                  className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-3 dark:border-(--app-border-subtle) hover:bg-gray-50/60 dark:hover:bg-(--app-surface-hover)"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-gray-400 dark:text-(--app-text-secondary)" />
                  <div className="min-w-0 flex-1 basis-32">
                    <p className="truncate text-[12.5px] font-medium text-gray-800 dark:text-(--app-text-primary)">
                      {name}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-(--app-text-muted)"
                      title={folder}
                    >
                      {folder}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-[11px]',
                      health === 'ready'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : health === 'invalid'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-gray-400 dark:text-(--app-text-muted)'
                    )}
                  >
                    {health === 'ready'
                      ? 'Ready'
                      : health === 'invalid'
                        ? 'Unavailable'
                        : 'Checking'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleOpenFolder(folder)}
                      className={settingsIconButtonClassName}
                      aria-label={`Open ${folder}`}
                      title="Open folder"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemoveFolder(folder)}
                      className={settingsIconButtonClassName}
                      aria-label={`Remove ${folder}`}
                      title="Remove source"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title="Knowledge Search"
          badges={
            <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
              {searchResults.length} results
            </span>
          }
          className="items-center"
          actions={
            <div className="flex min-w-0 items-center gap-2">
              <ExpandableSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                onSubmit={() => void handleSearch()}
                placeholder="Search indexed documents..."
                loading={searching}
                disabled={searching}
                className="min-w-0 max-w-full"
              />
              <button
                onClick={() => void handleSearch()}
                className={cn(settingsOutlineButtonClassName, 'h-8 shrink-0')}
                disabled={searching}
              >
                Search
              </button>
              <button
                className={cn(settingsSecondaryButtonClassName, 'h-8 shrink-0')}
                disabled={
                  searching ||
                  (!searchQuery && searchResults.length === 0 && !searchMessage)
                }
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                  setSearchMessage(undefined)
                }}
              >
                Clear
              </button>
            </div>
          }
        />
        {hasUnsavedConfig && (
          <p className="px-4 pb-3 text-[11px] text-amber-600 dark:text-amber-400">
            Save settings before testing recall against the current index.
          </p>
        )}
        <div aria-live="polite">
          {searching ? (
            <SettingsLoadingState className="py-6">
              Searching indexed chunks...
            </SettingsLoadingState>
          ) : searchResults.length === 0 ? (
            <SettingsEmptyState
              icon={<Search className="h-4 w-4" />}
              title={
                searchMessage || 'Enter a query to inspect retrieval results'
              }
              description="Inspect matched files and retrieved excerpts."
              className="px-4 py-6"
            />
          ) : (
            searchResults.map((result) => (
              <div
                key={result.chunk_id}
                className="border-t border-gray-100 px-4 py-3 dark:border-(--app-border-subtle)"
              >
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-(--app-text-secondary)" />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[12.5px] font-medium text-gray-800 dark:text-(--app-text-primary)"
                      title={result.file_name}
                    >
                      {result.file_name}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-(--app-text-muted)"
                      title={result.file_path}
                    >
                      {result.file_path}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-(--app-text-secondary)">
                    score {formatScore(result.score)}
                  </span>
                  <button
                    onClick={() => void handleOpenFolder(result.file_path)}
                    className={settingsIconButtonClassName}
                    aria-label={`Open ${result.file_path}`}
                    title="Open file"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-700 dark:bg-(--app-surface-inset) dark:text-(--app-text-body) font-mono">
                  {result.text}
                </pre>
                <details className="group mt-2 text-[11px] text-gray-500 dark:text-(--app-text-secondary)">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3 w-3 group-open:rotate-90" />
                    Details
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                    <span>Similarity {formatScore(result.similarity)}</span>
                    <span>Chunk #{result.chunk_index}</span>
                    <span>
                      Range {result.char_start}–{result.char_end}
                    </span>
                    <span>{result.token_estimate} tokens</span>
                    <span>{result.ext || 'file'}</span>
                  </div>
                </details>
              </div>
            ))
          )}
        </div>
        <details className="group border-t border-gray-100 dark:border-(--app-border-subtle)">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-[12.5px] font-medium text-gray-700 dark:text-(--app-text-body) focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 group-open:rotate-90" />
            Advanced Settings
            <span className="ml-auto text-[11px] font-normal text-gray-400 dark:text-(--app-text-muted)">
              Chunking and retrieval limits
            </span>
          </summary>
          <div className="border-t border-gray-100 px-4 py-1 dark:border-(--app-border-subtle)">
            <SettingsFieldRow
              title="Chunk Size"
              description="Target characters per chunk for document segmentation."
              className="flex-wrap border-b border-gray-100 dark:border-(--app-border-subtle)"
              control={
                <SettingsControlGroup>
                  <Input
                    type="number"
                    aria-label="Chunk Size"
                    min={200}
                    max={4000}
                    value={chunkSize}
                    onChange={(e) => {
                      const value = clampNumber(
                        parseInt(e.target.value, 10),
                        1200,
                        200,
                        4000
                      )
                      setChunkSize(value)
                    }}
                    className={cn(
                      settingsInputClassName,
                      'text-center px-0 h-8 w-20 font-mono font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                    )}
                  />
                  <span className="text-xs font-medium text-gray-400 pr-2">
                    chars
                  </span>
                </SettingsControlGroup>
              }
            />

            <SettingsFieldRow
              title="Chunk Overlap"
              description="Shared characters between adjacent chunks to preserve local context."
              className="flex-wrap border-b border-gray-100 dark:border-(--app-border-subtle)"
              control={
                <SettingsControlGroup>
                  <Input
                    type="number"
                    aria-label="Chunk Overlap"
                    min={0}
                    max={1000}
                    value={chunkOverlap}
                    onChange={(e) => {
                      const value = clampNumber(
                        parseInt(e.target.value, 10),
                        200,
                        0,
                        1000
                      )
                      setChunkOverlap(value)
                    }}
                    className={cn(
                      settingsInputClassName,
                      'text-center px-0 h-8 w-20 font-mono font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                    )}
                  />
                  <span className="text-xs font-medium text-gray-400 pr-2">
                    chars
                  </span>
                </SettingsControlGroup>
              }
            />

            <SettingsFieldRow
              title="Max Results"
              className="flex-wrap"
              description="Default upper bound for retrieval result count."
              control={
                <SettingsControlGroup>
                  <Input
                    type="number"
                    aria-label="Max Results"
                    min={1}
                    max={20}
                    value={maxResults}
                    onChange={(e) => {
                      const value = clampNumber(
                        parseInt(e.target.value, 10),
                        8,
                        1,
                        20
                      )
                      setMaxResults(value)
                    }}
                    className={cn(
                      settingsInputClassName,
                      'text-center px-0 h-8 w-20 font-mono font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                    )}
                  />
                  <span className="text-xs font-medium text-gray-400 pr-2">
                    items
                  </span>
                </SettingsControlGroup>
              }
            />
          </div>
        </details>
      </SettingsSection>
    </SettingsPageShell>
  )
}

export default KnowledgebaseManager
