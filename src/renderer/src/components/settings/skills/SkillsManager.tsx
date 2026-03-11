import React, { useEffect, useMemo, useState } from 'react'
import { listInstalledSkills } from '@renderer/services/skills/SkillService'
import { getChatSkills } from '@renderer/db/ChatSkillRepository'
import { useChatStore } from '@renderer/store'
import { invokeCheckIsDirectory, invokeImportSkills, invokeSelectDirectory } from '@renderer/invoker/ipcInvoker'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { toast } from 'sonner'
import { invokeLoadSkill, invokeUnloadSkill } from '@renderer/tools/skills/renderer/SkillToolsInvoker'
import SkillFolders from './SkillFolders'
import AvailableSkills from './AvailableSkills'

type ImportSkillsResult = {
  installed: SkillMetadata[]
  renamed: Array<{ from: string; to: string }>
  skipped: Array<{ path: string; reason: string }>
  failed: Array<{ path: string; error: string }>
}

const normalizeImportResult = (value: any): ImportSkillsResult => {
  return {
    installed: Array.isArray(value?.installed) ? value.installed : [],
    renamed: Array.isArray(value?.renamed) ? value.renamed : [],
    skipped: Array.isArray(value?.skipped) ? value.skipped : [],
    failed: Array.isArray(value?.failed) ? value.failed : []
  }
}

const summarizeImport = (result: ImportSkillsResult): string => {
  const parts: string[] = []
  if (result.installed.length > 0) parts.push(`${result.installed.length} installed`)
  if (result.renamed.length > 0) parts.push(`${result.renamed.length} renamed`)
  if (result.failed.length > 0) parts.push(`${result.failed.length} failed`)
  if (parts.length === 0) return 'No skills found'
  return parts.join(', ')
}

const SkillsManager: React.FC = () => {
  const { currentChatId, currentChatUuid } = useChatStore()
  const { appConfig, setAppConfig } = useAppConfigStore()
  const [skills, setSkills] = useState<SkillMetadata[]>([])
  const [activeSkills, setActiveSkills] = useState<string[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [pendingSkills, setPendingSkills] = useState<Set<string>>(new Set())
  const [pendingFolders, setPendingFolders] = useState<Set<string>>(new Set())

  const hasActiveChat = Boolean(currentChatId && currentChatUuid)

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills])

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedSkills
    }
    const query = searchQuery.toLowerCase()
    return sortedSkills.filter(skill => {
      const haystack = [
        skill.name,
        skill.description,
        skill.compatibility || '',
        skill.allowedTools?.join(' ') || ''
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [sortedSkills, searchQuery])

  const refreshSkills = async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      const result = await listInstalledSkills()
      setSkills(result)
    } catch (error) {
      console.error('[SkillsManager] Failed to list skills:', error)
      toast.error('Failed to load installed skills')
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
    const stored = appConfig.skills?.folders || []
    setFolders(stored)
  }, [appConfig.skills?.folders])

  const setSkillPending = (name: string, pending: boolean) => {
    setPendingSkills(prev => {
      const next = new Set(prev)
      if (pending) {
        next.add(name)
      } else {
        next.delete(name)
      }
      return next
    })
  }

  const updateFolders = (nextFolders: string[]) => {
    setFolders(nextFolders)
    void setAppConfig({
      ...appConfig,
      skills: {
        ...(appConfig.skills || {}),
        folders: nextFolders
      }
    })
  }

  const setFolderPending = (folder: string, pending: boolean) => {
    setPendingFolders(prev => {
      const next = new Set(prev)
      if (pending) {
        next.add(folder)
      } else {
        next.delete(folder)
      }
      return next
    })
  }

  const scanFolder = async (folder: string): Promise<void> => {
    setFolderPending(folder, true)
    try {
      const result = normalizeImportResult(await invokeImportSkills(folder))
      const summary = summarizeImport(result)
      if (result.failed.length > 0) {
        toast.error(summary)
      } else {
        toast.success(summary)
      }
      await refreshSkills()
      await refreshActiveSkills()
    } catch (error: any) {
      console.error('[SkillsManager] Import failed:', error)
      toast.error(error.message || 'Failed to import skills')
    } finally {
      setFolderPending(folder, false)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    const result = await invokeSelectDirectory()
    if (!result.success || !result.path) {
      return
    }
    const nextFolders = folders.includes(result.path)
      ? folders
      : [...folders, result.path]
    updateFolders(nextFolders)
    await scanFolder(result.path)
  }

  const handleRemoveFolder = (folder: string) => {
    const nextFolders = folders.filter(item => item !== folder)
    updateFolders(nextFolders)
  }

  const scanAllFolders = async (): Promise<void> => {
    if (folders.length === 0) {
      return
    }

    setPendingFolders(new Set(folders))
    try {
      const directoryChecks = await Promise.allSettled(
        folders.map(folder => invokeCheckIsDirectory(folder))
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
        if (payload.success && payload.isDirectory) {
          validFolders.push(folder)
        } else {
          invalidFolders.push(folder)
        }
      })

      if (invalidFolders.length > 0) {
        const nextFolders = folders.filter(folder => !invalidFolders.includes(folder))
        updateFolders(nextFolders)
        const removedPathsText = invalidFolders.map(path => `• ${path}`).join('\n')
        toast.error(`Removed invalid skill folder path(s):\n${removedPathsText}`)
      }

      if (validFolders.length === 0) {
        toast.error('No valid skill folders found. Invalid paths were removed.')
        if (invalidFolders.length > 0) {
          console.warn('[SkillsManager] Invalid folders skipped:', invalidFolders)
        }
        return
      }

      const results = await Promise.allSettled(
        validFolders.map(folder => invokeImportSkills(folder))
      )

      let installedCount = 0
      let renamedCount = 0
      let failedCount = invalidFolders.length
      const failedFolders: string[] = []

      results.forEach((result, index) => {
        const folder = validFolders[index]
        if (result.status === 'fulfilled') {
          const normalized = normalizeImportResult(result.value)
          installedCount += normalized.installed.length
          renamedCount += normalized.renamed.length
          failedCount += normalized.failed.length
        } else {
          failedCount += 1
          failedFolders.push(folder)
        }
      })

      const parts: string[] = []
      if (installedCount > 0) parts.push(`${installedCount} installed`)
      if (renamedCount > 0) parts.push(`${renamedCount} renamed`)
      if (failedCount > 0) parts.push(`${failedCount} failed`)
      const summary = parts.length > 0 ? parts.join(', ') : 'No skills found'

      if (failedCount > 0) {
        const invalidNotice = invalidFolders.length > 0
          ? ` (${invalidFolders.length} invalid folder path${invalidFolders.length > 1 ? 's' : ''} skipped)`
          : ''
        toast.error(`Rescan complete: ${summary}${invalidNotice}`)
      } else {
        toast.success(`Rescan complete: ${summary}`)
      }

      if (invalidFolders.length > 0) {
        console.warn('[SkillsManager] Invalid folders skipped:', invalidFolders)
      }

      if (failedFolders.length > 0) {
        console.warn('[SkillsManager] Failed to import from folders:', failedFolders)
      }

      await refreshSkills()
      await refreshActiveSkills()
    } catch (error: any) {
      console.error('[SkillsManager] Rescan failed:', error)
      toast.error(error.message || 'Failed to rescan folders')
    } finally {
      setPendingFolders(new Set())
    }
  }

  const toggleSkillActive = async (name: string, nextActive: boolean): Promise<void> => {
    if (!currentChatId || !currentChatUuid) {
      toast.error('Open a chat to activate skills')
      return
    }

    setSkillPending(name, true)
    try {
      if (nextActive) {
        const result = await invokeLoadSkill({ name, chat_uuid: currentChatUuid })
        if (!result.success) {
          throw new Error(result.message || `Failed to load skill: ${name}`)
        }
        toast.success(`Activated ${name}`)
      } else {
        const result = await invokeUnloadSkill({ name, chat_uuid: currentChatUuid })
        if (!result.success) {
          throw new Error(result.message || `Failed to unload skill: ${name}`)
        }
        toast.success(`Deactivated ${name}`)
      }
      await refreshActiveSkills()
    } catch (error: any) {
      console.error('[SkillsManager] Failed to toggle skill:', error)
      toast.error(error?.message || 'Failed to update skill status')
    } finally {
      setSkillPending(name, false)
    }
  }

  return (
    <div className="w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0">
      <div className="w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500">
        <SkillFolders
          folders={folders}
          pendingFolders={pendingFolders}
          onRescanAll={scanAllFolders}
          onAddFolder={handleAddFolder}
          onRemoveFolder={handleRemoveFolder}
        />
        <AvailableSkills
          skills={skills}
          filteredSkills={filteredSkills}
          activeSkills={activeSkills}
          pendingSkills={pendingSkills}
          hasActiveChat={hasActiveChat}
          isRefreshing={isRefreshing}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onRefreshSkills={refreshSkills}
          onToggleSkillActive={toggleSkillActive}
        />
      </div>
    </div>
  )
}

export default SkillsManager
