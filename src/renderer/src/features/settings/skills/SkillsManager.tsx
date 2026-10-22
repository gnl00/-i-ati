import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getChatSkills } from '@renderer/infrastructure/persistence/ChatSkillRepository'
import { useChatStore } from '@renderer/features/chat'
import {
  invokeRefreshSkills,
  invokeSkillScanResult,
  invokeOpenPath,
  invokeRevealSkillInFolder,
  invokeSelectDirectory
} from '@renderer/infrastructure/ipc'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { toast } from 'sonner'
import { ChevronRight, FolderOpen, Search, X } from 'lucide-react'
import ExpandableSearchInput from '../common/ExpandableSearchInput'
import { cn } from '@renderer/shared/lib/utils'
import { Switch } from '@renderer/shared/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/shared/components/ui/tooltip'
import {
  SettingsEmptyState,
  SettingsList,
  SettingsListItem,
  SettingsPageShell,
  SettingsSectionHeader,
  SettingsToolbar,
  SettingsSubsectionHeader,
  SettingsLoadingState,
  settingsPrimaryButtonClassName,
  settingsSecondaryButtonClassName
} from '../common/SettingsLayout'

const getFolderDisplayParts = (
  folder: string
): { parent?: string; name: string } => {
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

const SkillSummary: React.FC<{ name: string; text: string }> = ({
  name,
  text
}) => {
  const id = useId()
  const paragraph = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    const element = paragraph.current
    if (!element || expanded) return
    const measure = (): void =>
      setTruncated(element.scrollHeight > element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return (): void => observer.disconnect()
  }, [text, expanded])

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1">
        <p className="min-w-0 break-all text-[13px] font-medium tracking-tight text-gray-900 dark:text-(--app-text-primary)">
          {name}
        </p>
        {(truncated || expanded) && (
          <button
            type="button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} description for ${name}`}
            title={expanded ? 'Collapse description' : 'Expand description'}
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded(!expanded)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-(--app-text-muted) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary) dark:focus-visible:outline-(--app-accent) active:scale-95"
          >
            <ChevronRight className={cn('h-3 w-3', expanded && 'rotate-90')} />
          </button>
        )}
      </div>
      {text && (
        <p
          ref={paragraph}
          id={id}
          className={cn(
            'whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-gray-500 dark:text-(--app-text-secondary)',
            !expanded && 'line-clamp-2'
          )}
        >
          {text}
        </p>
      )}
    </div>
  )
}

const SkillsManager: React.FC = () => {
  const { currentChatId, currentChatUuid, chatSkillsRevisionByChatUuid } =
    useChatStore()
  const chatSkillsRevision = currentChatUuid
    ? (chatSkillsRevisionByChatUuid[currentChatUuid] ?? 0)
    : 0
  const currentChatIdRef = useRef(currentChatId)
  currentChatIdRef.current = currentChatId
  const activeSkillsRequestSequenceRef = useRef(0)
  const { appConfig, setAppConfig } = useAppConfigStore()
  const [skills, setSkills] = useState<SkillMetadata[]>([])
  const [issues, setIssues] = useState<SkillScanIssue[]>([])
  const [activeSkillsState, setActiveSkillsState] = useState<{
    chatId: number | null
    names: string[]
  }>({ chatId: null, names: [] })
  const activeSkills =
    activeSkillsState.chatId === currentChatId ? activeSkillsState.names : []
  const [folders, setFolders] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [pendingFolders, setPendingFolders] = useState<Set<string>>(new Set())
  const [savingSkill, setSavingSkill] = useState<string | null>(null)
  const toggleLock = useRef(false)

  const setSkillEnabled = async (name: string, enabled: boolean): Promise<void> => {
    if (toggleLock.current) return
    toggleLock.current = true
    setSavingSkill(name)
    try {
      const disabledNames = new Set(appConfig.skills?.disabledNames ?? [])
      if (enabled) disabledNames.delete(name)
      else disabledNames.add(name)
      await setAppConfig({
        ...appConfig,
        skills: { ...appConfig.skills, disabledNames: [...disabledNames].sort() }
      })
      setSkills(current => current.map(skill => skill.name === name ? { ...skill, enabled } : skill))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update skill')
    } finally {
      toggleLock.current = false
      setSavingSkill(null)
    }
  }

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills])

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return sortedSkills
    const query = searchQuery.toLowerCase()
    return sortedSkills.filter(skill => {
      const haystack = [
        skill.name,
        skill.description,
        skill.compatibility || '',
        skill.allowedTools?.join(' ') || ''
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [sortedSkills, searchQuery])

  const refreshSkills = async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      const result = await invokeSkillScanResult()
      setSkills(result.skills)
      setIssues(result.issues)
    } catch (error) {
      console.error('[SkillsManager] Failed to list skills:', error)
      toast.error('Failed to load skills')
    } finally {
      setIsRefreshing(false)
    }
  }

  const refreshActiveSkills = async (): Promise<void> => {
    const chatId = currentChatIdRef.current
    const requestSequence = ++activeSkillsRequestSequenceRef.current
    if (!chatId) {
      setActiveSkillsState({ chatId: null, names: [] })
      return
    }
    try {
      const result = await getChatSkills(chatId)
      if (
        activeSkillsRequestSequenceRef.current !== requestSequence ||
        currentChatIdRef.current !== chatId
      ) {
        return
      }
      setActiveSkillsState({ chatId, names: result })
    } catch (error) {
      if (
        activeSkillsRequestSequenceRef.current !== requestSequence ||
        currentChatIdRef.current !== chatId
      ) {
        return
      }
      console.error('[SkillsManager] Failed to load active skills:', error)
      toast.error('Failed to load active skills')
    }
  }

  useEffect(() => {
    refreshSkills()
  }, [])
  useEffect(() => {
    void refreshActiveSkills()
    return (): void => {
      activeSkillsRequestSequenceRef.current += 1
    }
  }, [currentChatId, chatSkillsRevision])
  useEffect(() => {
    setFolders(appConfig.skills?.folders || [])
  }, [appConfig.skills?.folders])

  const updateFolders = async (nextFolders: string[]): Promise<void> => {
    setPendingFolders(new Set([...folders, ...nextFolders]))
    try {
      await setAppConfig({
        ...appConfig,
        skills: { ...(appConfig.skills || {}), folders: nextFolders }
      })
      setFolders(nextFolders)
      await refreshSkills()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update skill folders'
      )
    } finally {
      setPendingFolders(new Set())
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    const result = await invokeSelectDirectory()
    if (!result.success || !result.path) return
    if (!folders.includes(result.path))
      await updateFolders([...folders, result.path])
  }

  const handleRemoveFolder = async (folder: string): Promise<void> => {
    await updateFolders(folders.filter(item => item !== folder))
  }

  const handleOpenFolder = async (folder: string): Promise<void> => {
    try {
      const result = await invokeOpenPath(folder)
      if (!result.success) {
        toast.error(result.error || 'Failed to open folder')
        return
      }
    } catch (error: unknown) {
      console.error('[SkillsManager] Failed to open folder:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to open folder'
      )
    }
  }

  const scanAllFolders = async (): Promise<void> => {
    setIsRefreshing(true)
    setPendingFolders(new Set(folders))
    try {
      const result = await invokeRefreshSkills()
      setSkills(result.skills)
      setIssues(result.issues)
      toast.success(`${result.skills.length} skills available`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to scan skill folders'
      )
    } finally {
      setIsRefreshing(false)
      setPendingFolders(new Set())
    }
  }

  const handleRevealSkill = async (name: string): Promise<void> => {
    try {
      const result = await invokeRevealSkillInFolder(name)
      if (!result.success) {
        toast.error(result.error || `Failed to open skill: ${name}`)
        return
      }
    } catch (error: unknown) {
      console.error('[SkillsManager] Failed to reveal skill:', error)
      toast.error(
        error instanceof Error ? error.message : `Failed to open skill: ${name}`
      )
    }
  }

  return (
    <SettingsPageShell contentClassName="gap-2">
      <SettingsSectionHeader
        title="Skills"
        description="Use skills directly from source folders."
      />

      <div className="mx-4 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
        <SettingsSubsectionHeader
          title="Source Folders"
          className="flex-wrap items-center border-t-0 bg-transparent px-3 py-2 dark:bg-transparent [&>div:last-child]:max-w-full"
          badges={
            <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
              {folders.length} folders
            </span>
          }
          actions={
            <>
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0">
                      <button
                        onClick={scanAllFolders}
                        disabled={isRefreshing || pendingFolders.size > 0 || savingSkill !== null}
                        className={settingsSecondaryButtonClassName}
                        aria-label="Rescan skill folders"
                      >
                        <i className="ri-folder-history-line text-[12px]" />
                        Rescan
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">
                      Scan configured folders for new or updated skills.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button
                onClick={handleAddFolder}
                disabled={isRefreshing || pendingFolders.size > 0 || savingSkill !== null}
                className={settingsPrimaryButtonClassName}
              >
                <i className="ri-folder-add-line text-[12px]" />
                Add Folder
              </button>
            </>
          }
        />

        <SettingsToolbar className="flex max-h-32 min-w-0 flex-wrap items-center gap-2 overflow-y-auto border-t border-gray-100 bg-transparent px-3 py-1.5 dark:border-(--app-border-subtle) dark:bg-transparent">
          {folders.length === 0 ? (
            <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
              Add a folder to scan for skills.
            </span>
          ) : (
            <>
              {folders.map(folder => {
                const isPending = pendingFolders.has(folder)
                const display = getFolderDisplayParts(folder)
                return (
                  <div
                    key={folder}
                    className="group/f flex max-w-[240px] min-w-0 items-center rounded-md border border-gray-200/80 bg-white/80 dark:border-(--app-border-standard) dark:bg-(--app-surface-raised)"
                  >
                    <button
                      type="button"
                      title={folder}
                      aria-label={`Open folder ${folder}`}
                      onClick={() => void handleOpenFolder(folder)}
                      className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-l-md px-2 text-left hover:bg-gray-50 dark:hover:bg-(--app-surface-hover) active:scale-[0.98]"
                    >
                      <i
                        className={`ri-folder-3-line shrink-0 text-[12px] ${isPending ? 'text-amber-500' : 'text-gray-400 dark:text-(--app-text-muted)'}`}
                      />
                      <span className="flex min-w-0 items-baseline gap-1 font-mono text-[10.5px]">
                        {display.parent && (
                          <>
                            <span className="truncate text-gray-400 dark:text-(--app-text-muted)">
                              {display.parent}
                            </span>
                            <span className="shrink-0 text-gray-300 dark:text-(--app-text-muted)">
                              /
                            </span>
                          </>
                        )}
                        <span className="truncate text-gray-700 dark:text-(--app-text-body)">
                          {display.name}
                        </span>
                      </span>
                    </button>
                    {isPending ? (
                      <span className="text-[9px] text-amber-500 shrink-0 pr-1">
                        …
                      </span>
                    ) : (
                      <button
                        onPointerDown={event => event.stopPropagation()}
                        onKeyDown={event => event.stopPropagation()}
                        onClick={event => {
                          event.stopPropagation()
                          void handleRemoveFolder(folder)
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover/f:opacity-100 group-focus-within/f:opacity-100 transition-[color,opacity,transform] duration-150 active:scale-95 shrink-0"
                        disabled={isRefreshing || pendingFolders.size > 0 || savingSkill !== null}
                        aria-label={`Remove folder ${folder}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </SettingsToolbar>
      </div>

      {issues.length > 0 && (
        <details className="mx-4 mb-2 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-(--app-border-subtle) dark:text-(--app-text-secondary)">
          <summary className="cursor-pointer">
            {issues.length} source notices
          </summary>
          <ul className="mt-2 space-y-2">
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`} className="break-all">
                <span className="font-medium">{issue.path}</span>:{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
        <SettingsSubsectionHeader
          title="Available Skills"
          className="flex-wrap items-center border-t-0 bg-transparent px-3 dark:bg-transparent [&>div:last-child]:max-w-full"
          badges={
            <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
              {searchQuery.trim()
                ? `${filteredSkills.length} results`
                : `${skills.length} skills`}
            </span>
          }
          actions={
            <>
              <ExpandableSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search available skills"
                expandedWidth="w-[min(260px,40vw)]"
              />
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0">
                      <button
                        onClick={scanAllFolders}
                        disabled={isRefreshing || pendingFolders.size > 0 || savingSkill !== null}
                        className={cn(settingsSecondaryButtonClassName, 'h-8')}
                        aria-label="Refresh skill sources"
                      >
                        <i
                          className={`ri-refresh-line text-[12px] ${isRefreshing ? 'animate-spin' : ''}`}
                        />
                        Refresh
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">
                      Scan source folders for available skills.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          }
        />

        <SettingsList className="bg-transparent dark:bg-transparent">
          {isRefreshing && skills.length === 0 ? (
            <SettingsLoadingState>Loading skills…</SettingsLoadingState>
          ) : (
            filteredSkills.length === 0 && (
              <>
                {searchQuery ? (
                  <SettingsEmptyState
                    icon={
                      <Search className="h-4 w-4 text-gray-400 dark:text-(--app-text-muted)" />
                    }
                    title="No skills match"
                  >
                    <p className="text-[11.5px] text-gray-400 dark:text-(--app-text-muted)">
                      Try a different keyword or{' '}
                      <button
                        onClick={() => setSearchQuery('')}
                        className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        clear search
                      </button>
                    </p>
                  </SettingsEmptyState>
                ) : (
                  <SettingsEmptyState
                    icon={
                      <i className="ri-magic-line text-[15px] text-gray-400 dark:text-(--app-text-muted)" />
                    }
                    title="No skills available"
                    description="Add a folder above to scan for skills."
                  />
                )}
              </>
            )
          )}

          {filteredSkills.map(skill => {
            const isEnabled = skill.enabled !== false
            const isActive = isEnabled && activeSkills.includes(skill.name)
            const isBuiltIn = skill.source === 'built-in'
            const hasDetails =
              !!skill.allowedTools?.length || !!skill.compatibility
            const metadata = (
              <>
                {!isEnabled && <span>Disabled</span>}
                {isActive && (
                  <span
                    className="text-emerald-600 dark:text-emerald-400"
                    title="Active in the current chat"
                  >
                    Active
                  </span>
                )}
                {isBuiltIn ? (
                  <span>Built-in</span>
                ) : (
                  <span className="max-w-full break-all" title={skill.path}>
                    {skill.source}
                  </span>
                )}
                {!!skill.allowedTools?.length && (
                  <span>{skill.allowedTools.length} tools</span>
                )}
              </>
            )
            return (
              <SettingsListItem key={skill.name} className="gap-3 px-3 py-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SkillSummary
                    name={skill.name}
                    text={skill.description || ''}
                  />
                  {hasDetails ? (
                    <details className="group/details text-[10.5px] text-gray-400 dark:text-(--app-text-muted)">
                      <summary className="flex w-fit max-w-full cursor-pointer select-none list-none flex-wrap items-center gap-x-3 gap-y-1 rounded hover:text-gray-600 dark:hover:text-(--app-text-secondary) [&::-webkit-details-marker]:hidden">
                        {metadata}
                        <span className="inline-flex items-center gap-1">
                          <ChevronRight className="h-3 w-3 group-open/details:rotate-90" />
                          Details
                        </span>
                      </summary>
                      <div className="mt-2 space-y-2 border-l border-gray-200 pl-3 dark:border-(--app-border-subtle)">
                        {!!skill.allowedTools?.length && (
                          <div>
                            <p className="mb-1 font-medium text-gray-500 dark:text-(--app-text-secondary)">
                              Allowed tools
                            </p>
                            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 font-mono">
                              {skill.allowedTools.map(tool => (
                                <span
                                  key={tool}
                                  className="max-w-full break-all"
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {skill.compatibility && (
                          <div>
                            <p className="mb-1 font-medium text-gray-500 dark:text-(--app-text-secondary)">
                              Compatibility
                            </p>
                            <p className="break-words leading-relaxed">
                              {skill.compatibility}
                            </p>
                          </div>
                        )}
                      </div>
                    </details>
                  ) : (
                    (!isEnabled || isActive || !!skill.source) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-gray-400 dark:text-(--app-text-muted)">
                        {metadata}
                      </div>
                    )
                  )}
                </div>
                <div className="flex h-7 w-[68px] shrink-0 self-center items-center gap-2">
                  <Switch
                    className={cn(
                      'h-4.5 w-8 [&>span]:size-3.5 [&>span]:shadow-none [&>span[data-state=checked]]:translate-x-3.5',
                      savingSkill !== null && savingSkill !== skill.name && 'disabled:opacity-100'
                    )}
                    checked={isEnabled}
                    onCheckedChange={enabled => void setSkillEnabled(skill.name, enabled)}
                    disabled={savingSkill !== null || isRefreshing || pendingFolders.size > 0}
                    aria-label={`Enable ${skill.name}`}
                    title={isEnabled ? 'Included in model context' : 'Excluded from model context'}
                  />
                  <button
                    type="button"
                    onClick={() => void handleRevealSkill(skill.name)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:text-(--app-text-muted) dark:hover:text-(--app-text-primary) hover:bg-gray-100 dark:hover:bg-(--app-surface-hover) opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:focus-visible:outline-(--app-accent) transition-[color,background-color,opacity,transform] duration-150 active:scale-95"
                    aria-label={`Show ${skill.name} in folder`}
                    title="Show in folder"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </SettingsListItem>
            )
          })}
        </SettingsList>
      </div>
    </SettingsPageShell>
  )
}

export default SkillsManager
