import React, { useEffect, useMemo, useState } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { listInstalledSkills } from '@renderer/services/skills/SkillService'
import { addChatSkill, getChatSkills, removeChatSkill } from '@renderer/db/ChatSkillRepository'
import { useChatStore } from '@renderer/store'
import { invokeSelectDirectory, invokeSkillImportFolder } from '@renderer/invoker/ipcInvoker'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { toast } from 'sonner'

const SkillsManager: React.FC = () => {
  const { currentChatId, currentChatUuid } = useChatStore()
  const { appConfig, setAppConfig } = useAppConfigStore()
  const [skills, setSkills] = useState<SkillMetadata[]>([])
  const [activeSkills, setActiveSkills] = useState<string[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [pendingSkills, setPendingSkills] = useState<Set<string>>(new Set())
  const [pendingFolders, setPendingFolders] = useState<Set<string>>(new Set())

  const hasActiveChat = Boolean(currentChatId && currentChatUuid)

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills])

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

  const summarizeImport = (result: {
    installed: SkillMetadata[]
    renamed: Array<{ from: string; to: string }>
    skipped: Array<{ path: string; reason: string }>
    failed: Array<{ path: string; error: string }>
  }): string => {
    const parts: string[] = []
    if (result.installed.length > 0) parts.push(`${result.installed.length} installed`)
    if (result.renamed.length > 0) parts.push(`${result.renamed.length} renamed`)
    if (result.failed.length > 0) parts.push(`${result.failed.length} failed`)
    if (parts.length === 0) return 'No skills found'
    return parts.join(', ')
  }

  const scanFolder = async (folder: string): Promise<void> => {
    setFolderPending(folder, true)
    try {
      const result = await invokeSkillImportFolder(folder)
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
      const results = await Promise.allSettled(
        folders.map(folder => invokeSkillImportFolder(folder))
      )

      let installedCount = 0
      let renamedCount = 0
      let failedCount = 0
      const failedFolders: string[] = []

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          installedCount += result.value.installed.length
          renamedCount += result.value.renamed.length
          failedCount += result.value.failed.length
        } else {
          failedCount += 1
          failedFolders.push(folders[index])
        }
      })

      const parts: string[] = []
      if (installedCount > 0) parts.push(`${installedCount} installed`)
      if (renamedCount > 0) parts.push(`${renamedCount} renamed`)
      if (failedCount > 0) parts.push(`${failedCount} failed`)
      const summary = parts.length > 0 ? parts.join(', ') : 'No skills found'

      if (failedCount > 0) {
        toast.error(`Rescan complete: ${summary}`)
      } else {
        toast.success(`Rescan complete: ${summary}`)
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
    if (!currentChatId) {
      toast.error('Open a chat to activate skills')
      return
    }

    setSkillPending(name, true)
    try {
      if (nextActive) {
        await addChatSkill(currentChatId, name)
        toast.success(`Activated ${name}`)
      } else {
        await removeChatSkill(currentChatId, name)
        toast.success(`Deactivated ${name}`)
      }
      await refreshActiveSkills()
    } catch (error) {
      console.error('[SkillsManager] Failed to toggle skill:', error)
      toast.error('Failed to update skill status')
    } finally {
      setSkillPending(name, false)
    }
  }

  return (
    <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
      <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500'>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                  Skill Folders
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-indigo-600 border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800">
                  SKILLS
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Add folders to scan for skills. Only direct subfolders are scanned.
              </p>
              <p className="text-xs text-gray-400">
                Name conflicts are resolved by appending the folder name (e.g. <span className="font-mono">skill-folder</span>).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={scanAllFolders}
                disabled={folders.length === 0 || pendingFolders.size > 0}
                className="shadow-sm"
              >
                <i className="ri-refresh-line mr-1.5"></i>
                Rescan All
              </Button>
              <Button
                size="sm"
                onClick={handleAddFolder}
                className="shadow-sm"
              >
                <i className="ri-folder-add-line mr-1.5"></i>
                Add Folder
              </Button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {folders.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No folders added yet.
              </p>
            )}
            {folders.map(folder => {
              const isPending = pendingFolders.has(folder)
              return (
                <div key={folder} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40">
                  <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                    {folder}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleRemoveFolder(folder)}
                      disabled={isPending}
                      className="shadow-sm"
                    >
                      <i className="ri-delete-bin-line mr-1.5"></i>
                      Remove
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="p-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                  Installed Skills
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                  {skills.length} total
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Toggle a skill to activate or deactivate it for the current chat.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshSkills}
                disabled={isRefreshing}
                className="shadow-sm"
              >
                <i className="ri-refresh-line mr-1.5"></i>
                Refresh List
              </Button>
            </div>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50">
            <div className="max-h-[360px] overflow-y-auto">
              {sortedSkills.length === 0 && (
                <div className="p-5 text-sm text-gray-500 dark:text-gray-400">
                  No skills installed yet.
                </div>
              )}
              {sortedSkills.map(skill => {
                const isActive = activeSkills.includes(skill.name)
                const isPending = pendingSkills.has(skill.name)
                return (
                  <div key={skill.name} className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{skill.name}</span>
                        {isActive && (
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Active
                          </Badge>
                        )}
                        {skill.allowedTools && skill.allowedTools.length > 0 && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                            {skill.allowedTools.length} tools
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        {skill.description}
                      </p>
                      {skill.compatibility && (
                        <p className="text-xs text-gray-400">{skill.compatibility}</p>
                      )}
                      {skill.allowedTools && skill.allowedTools.length > 0 && (
                        <p className="text-xs text-gray-400">
                          Allowed tools: {skill.allowedTools.join(' ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => toggleSkillActive(skill.name, checked)}
                        disabled={!hasActiveChat || isPending}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SkillsManager
