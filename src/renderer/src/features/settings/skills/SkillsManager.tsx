import React, { useEffect, useMemo, useState } from 'react'
import { listAvailableSkills } from '@renderer/features/settings/skills/SkillService'
import { getChatSkills } from '@renderer/infrastructure/persistence/ChatSkillRepository'
import { useChatStore } from '@renderer/features/chat'
import {
  invokeCheckIsDirectory,
  invokeDeleteSkill,
  invokeImportSkills,
  invokeOpenPath,
  invokeRevealSkillInFolder,
  invokeSelectDirectory
} from '@renderer/infrastructure/ipc'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { toast } from 'sonner'
import InlineDeleteConfirm from '../common/InlineDeleteConfirm'
import { FolderOpen, Search, X } from 'lucide-react'
import ExpandableSearchInput from '../common/ExpandableSearchInput'
import { cn } from '@renderer/shared/lib/utils'
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

type ImportSkillsResult = {
  installed: SkillMetadata[]
  renamed: Array<{ from: string; to: string }>
  skipped: Array<{ path: string; reason: string }>
  failed: Array<{ path: string; error: string }>
}

const normalizeImportResult = (
  value: Partial<ImportSkillsResult> | null | undefined
): ImportSkillsResult => {
  return {
    installed: Array.isArray(value?.installed) ? value.installed : [],
    renamed: Array.isArray(value?.renamed) ? value.renamed : [],
    skipped: Array.isArray(value?.skipped) ? value.skipped : [],
    failed: Array.isArray(value?.failed) ? value.failed : []
  }
}

const summarizeImport = (result: ImportSkillsResult): string => {
  const parts: string[] = []
  if (result.installed.length > 0)
    parts.push(`${result.installed.length} installed`)
  if (result.renamed.length > 0) parts.push(`${result.renamed.length} renamed`)
  if (result.failed.length > 0) parts.push(`${result.failed.length} failed`)
  if (parts.length === 0) return 'No skills found'
  return parts.join(', ')
}

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

const SkillsManager: React.FC = () => {
  const { currentChatId } = useChatStore()
  const { appConfig, setAppConfig } = useAppConfigStore()
  const [skills, setSkills] = useState<SkillMetadata[]>([])
  const [activeSkills, setActiveSkills] = useState<string[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [pendingFolders, setPendingFolders] = useState<Set<string>>(new Set())

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills])

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return sortedSkills
    const query = searchQuery.toLowerCase()
    return sortedSkills.filter((skill) => {
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
      const result = await listAvailableSkills()
      setSkills(result)
    } catch (error) {
      console.error('[SkillsManager] Failed to list skills:', error)
      toast.error('Failed to load skills')
    } finally {
      setIsRefreshing(false)
    }
  }

  const refreshActiveSkills = async (): Promise<void> => {
    if (!currentChatId) {
      setActiveSkills([])
      return
    }
    try {
      const result = await getChatSkills(currentChatId)
      setActiveSkills(result)
    } catch (error) {
      console.error('[SkillsManager] Failed to load active skills:', error)
      toast.error('Failed to load active skills')
    }
  }

  useEffect(() => {
    refreshSkills()
  }, [])
  useEffect(() => {
    refreshActiveSkills()
  }, [currentChatId])
  useEffect(() => {
    setFolders(appConfig.skills?.folders || [])
  }, [appConfig.skills?.folders])

  const updateFolders = (nextFolders: string[]): void => {
    setFolders(nextFolders)
    void setAppConfig({
      ...appConfig,
      skills: { ...(appConfig.skills || {}), folders: nextFolders }
    })
  }

  const setFolderPending = (folder: string, pending: boolean): void => {
    setPendingFolders((prev) => {
      const next = new Set(prev)
      pending ? next.add(folder) : next.delete(folder)
      return next
    })
  }

  const scanFolder = async (folder: string): Promise<void> => {
    setFolderPending(folder, true)
    try {
      const result = normalizeImportResult(await invokeImportSkills(folder))
      const summary = summarizeImport(result)
      result.failed.length > 0 ? toast.error(summary) : toast.success(summary)
      await refreshSkills()
      await refreshActiveSkills()
    } catch (error: unknown) {
      console.error('[SkillsManager] Import failed:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to import skills'
      )
    } finally {
      setFolderPending(folder, false)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    const result = await invokeSelectDirectory()
    if (!result.success || !result.path) return
    const nextFolders = folders.includes(result.path)
      ? folders
      : [...folders, result.path]
    updateFolders(nextFolders)
    await scanFolder(result.path)
  }

  const handleRemoveFolder = (folder: string): void => {
    updateFolders(folders.filter((item) => item !== folder))
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
    if (folders.length === 0) return
    setPendingFolders(new Set(folders))
    try {
      const directoryChecks = await Promise.allSettled(
        folders.map((f) => invokeCheckIsDirectory(f))
      )
      const validFolders: string[] = []
      const invalidFolders: string[] = []

      directoryChecks.forEach((checkResult, index) => {
        const folder = folders[index]
        if (checkResult.status !== 'fulfilled') {
          invalidFolders.push(folder)
          return
        }
        const payload = checkResult.value
        payload.success && payload.isDirectory
          ? validFolders.push(folder)
          : invalidFolders.push(folder)
      })

      if (invalidFolders.length > 0) {
        updateFolders(folders.filter((f) => !invalidFolders.includes(f)))
        toast.error(
          `Removed invalid folder path(s):\n${invalidFolders.map((p) => `• ${p}`).join('\n')}`
        )
      }

      if (validFolders.length === 0) {
        toast.error('No valid skill folders found.')
        return
      }

      const results = await Promise.allSettled(
        validFolders.map((f) => invokeImportSkills(f))
      )
      let installedCount = 0,
        renamedCount = 0,
        failedCount = invalidFolders.length

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const n = normalizeImportResult(result.value)
          installedCount += n.installed.length
          renamedCount += n.renamed.length
          failedCount += n.failed.length
        } else {
          failedCount += 1
        }
      })

      const parts: string[] = []
      if (installedCount > 0) parts.push(`${installedCount} installed`)
      if (renamedCount > 0) parts.push(`${renamedCount} renamed`)
      if (failedCount > 0) parts.push(`${failedCount} failed`)
      const summary = parts.length > 0 ? parts.join(', ') : 'No skills found'

      failedCount > 0
        ? toast.error(`Rescan: ${summary}`)
        : toast.success(`Rescan: ${summary}`)
      await refreshSkills()
      await refreshActiveSkills()
    } catch (error: unknown) {
      console.error('[SkillsManager] Rescan failed:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to rescan folders'
      )
    } finally {
      setPendingFolders(new Set())
    }
  }

  const handleDeleteSkill = async (name: string): Promise<void> => {
    try {
      await invokeDeleteSkill(name)
      toast.success(`Removed skill: ${name}`)
      await refreshSkills()
      await refreshActiveSkills()
    } catch (error: unknown) {
      console.error('[SkillsManager] Failed to delete skill:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to remove skill: ${name}`
      )
    }
  }

  const handleRevealSkill = async (name: string): Promise<void> => {
    try {
      const result = await invokeRevealSkillInFolder(name)
      if (!result.success) {
        toast.error(result.error || `Failed to open skill: ${name}`)
        return
      }
      toast.success('Skill file shown')
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
        description="Manage skill folders and view available skills."
      />

      <div className="mx-4 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
        <SettingsSubsectionHeader
          title="Folders"
          className="flex-wrap items-center border-t-0 bg-transparent px-3 dark:bg-transparent [&>div:last-child]:max-w-full"
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
                        disabled={
                          folders.length === 0 || pendingFolders.size > 0
                        }
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
                className={settingsPrimaryButtonClassName}
              >
                <i className="ri-folder-add-line text-[12px]" />
                Add Folder
              </button>
            </>
          }
        />

        <SettingsToolbar className="flex max-h-32 min-w-0 flex-wrap items-center gap-2 overflow-y-auto border-t border-gray-100 bg-transparent px-3 dark:border-(--app-border-subtle) dark:bg-transparent">
          {folders.length === 0 ? (
            <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
              Add a folder to scan for skills.
            </span>
          ) : (
            <>
              {folders.map((folder) => {
                const isPending = pendingFolders.has(folder)
                const display = getFolderDisplayParts(folder)
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={folder}
                    title={folder}
                    onClick={() => void handleOpenFolder(folder)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void handleOpenFolder(folder)
                      }
                    }}
                    className="group/f flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-md bg-white/80 dark:bg-(--app-surface-raised) border border-gray-200/80 dark:border-(--app-border-standard) max-w-[240px] cursor-pointer transition-colors duration-150 hover:border-gray-300 dark:hover:border-(--app-border-standard) hover:bg-gray-50 dark:hover:bg-(--app-surface-hover) active:scale-[0.98]"
                  >
                    <i
                      className={`ri-folder-3-line text-[12px] shrink-0 ${isPending ? 'text-amber-500' : 'text-gray-400 dark:text-(--app-text-muted)'}`}
                    />
                    <span className="min-w-0 flex items-baseline gap-1 truncate font-mono text-[10.5px]">
                      {display.parent && (
                        <span className="truncate text-gray-400 dark:text-(--app-text-muted)">
                          {display.parent}
                        </span>
                      )}
                      {display.parent && (
                        <span className="shrink-0 text-gray-300 dark:text-gray-600">
                          /
                        </span>
                      )}
                      <span className="truncate text-gray-700 dark:text-(--app-text-body)">
                        {display.name}
                      </span>
                    </span>
                    {isPending ? (
                      <span className="text-[9px] text-amber-500 shrink-0 pr-1">
                        …
                      </span>
                    ) : (
                      <button
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRemoveFolder(folder)
                        }}
                        className="h-4 w-4 flex items-center justify-center rounded text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover/f:opacity-100 group-focus-within/f:opacity-100 transition-[color,opacity,transform] duration-150 active:scale-95 shrink-0"
                        aria-label="Remove folder"
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

      <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
        <SettingsSubsectionHeader
          title="Installed Skills"
          className="flex-wrap items-center border-t-0 bg-transparent px-3 dark:bg-transparent [&>div:last-child]:max-w-full"
          badges={
            <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
              {searchQuery.trim()
                ? `${filteredSkills.length} of ${skills.length} skills`
                : `${skills.length} skills`}
            </span>
          }
          actions={
            <>
              <ExpandableSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search installed skills"
                expandedWidth="w-[min(260px,40vw)]"
              />
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0">
                      <button
                        onClick={refreshSkills}
                        disabled={isRefreshing}
                        className={cn(settingsSecondaryButtonClassName, 'h-8')}
                        aria-label="Reload skills list"
                      >
                        <i
                          className={`ri-refresh-line text-[12px] ${isRefreshing ? 'animate-spin' : ''}`}
                        />
                        Reload
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">
                      Refresh the currently loaded skills list.
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

          {filteredSkills.map((skill) => {
            const isActive = activeSkills.includes(skill.name)
            const isBuiltIn = skill.source === 'built-in'
            return (
              <SettingsListItem key={skill.name} className="px-3 py-3">
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900 dark:text-(--app-text-primary) tracking-tight">
                      {skill.name}
                    </span>
                    {isActive && (
                      <span
                        className="text-[10.5px] text-emerald-600 dark:text-emerald-400"
                        title="Active in the current chat"
                      >
                        Active
                      </span>
                    )}
                    {isBuiltIn && (
                      <span className="text-[10.5px] text-gray-400 dark:text-(--app-text-muted)">
                        Built-in
                      </span>
                    )}
                    {skill.allowedTools && skill.allowedTools.length > 0 && (
                      <span className="text-[10.5px] text-gray-400 dark:text-(--app-text-muted)">
                        {skill.allowedTools.length} tools
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-[11.5px] text-gray-500 dark:text-(--app-text-secondary) leading-relaxed break-words">
                      {skill.description}
                    </p>
                  )}
                  {skill.allowedTools && skill.allowedTools.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 min-w-0 max-w-full">
                      {skill.allowedTools.map((tool) => (
                        <span
                          key={tool}
                          className="inline-flex max-w-full break-all font-mono text-[10.5px] text-gray-400 dark:text-(--app-text-muted)"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                  {skill.compatibility && (
                    <p className="text-[10.5px] text-gray-400 dark:text-(--app-text-muted) italic break-words">
                      {skill.compatibility}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleRevealSkill(skill.name)}
                    className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-(--app-text-primary) hover:bg-gray-100 dark:hover:bg-(--app-surface-hover) opacity-0 group-hover:opacity-100 focus:opacity-100 transition-[color,background-color,opacity,transform] duration-150 active:scale-95"
                    aria-label={`Show ${skill.name} in folder`}
                    title="Show in folder"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>
                  {!isBuiltIn && (
                    <InlineDeleteConfirm
                      onConfirm={() => handleDeleteSkill(skill.name)}
                      ariaLabel="Remove skill"
                      revealOnGroupHover
                    />
                  )}
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
