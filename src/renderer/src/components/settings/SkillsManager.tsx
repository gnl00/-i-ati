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
import { Input } from '../ui/input'
import { Search, X, ChevronDown } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@renderer/components/ui/accordion'

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
        <Accordion type="single" collapsible defaultValue="folders" className="w-full">
          <AccordionItem value="folders" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs hover:shadow-sm transition-all duration-200">
            <AccordionTrigger className="px-4 py-3 hover:no-underline group">
              <div className="flex items-center justify-between w-full pr-2">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                    Skill Folders
                  </Label>
                  <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-indigo-600 border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800">
                    {folders.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3">
              <div className="space-y-2 pt-1">
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Add folders to scan for skills. Subfolders are scanned recursively and stop at any folder containing SKILL.md.
                </p>
                <div id="action-button-container" className='w-full flex p-0'>
                <div className='flex-1'>
                  <p className="text-xs text-gray-400">
                    Name conflicts are resolved by appending the folder name (e.g. <span className="font-mono">skill-folder</span>).
                  </p>
                </div>
                <div
                  id="action-button"
                  className="inline-flex gap-0.5 rounded-full border border-gray-200/80 dark:border-gray-700/70 bg-white/70 dark:bg-gray-900/40 p-1"
                >
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      scanAllFolders()
                    }}
                    disabled={folders.length === 0 || pendingFolders.size > 0}
                    className="h-8 rounded-full px-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-800/70 disabled:opacity-60"
                  >
                    <i className="ri-refresh-line mr-1.5"></i>
                    Rescan All
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddFolder()
                    }}
                    className="h-8 rounded-full px-3 text-xs font-medium shadow-none bg-linear-to-r from-gray-900 to-gray-700 hover:from-gray-900 hover:to-gray-800 dark:from-gray-100 dark:to-gray-200 dark:hover:from-white dark:hover:to-gray-100 text-white dark:text-gray-900"
                  >
                    <i className="ri-folder-add-line mr-1.5"></i>
                    Add Folder
                  </Button>
                </div>
                </div>

                {folders.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 pt-2">
                    No folders added yet.
                  </p>
                ) : (
                  <div className="space-y-2 pt-2">
                    {folders.map(folder => {
                      const isPending = pendingFolders.has(folder)
                      return (
                        <div key={folder} className="group/folder flex items-center justify-between gap-3 px-3 py-1 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40">
                          <div className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                            {folder}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleRemoveFolder(folder)}
                              disabled={isPending}
                              className="h-7 rounded-full px-2.5 text-[11px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-500/10 opacity-0 group-hover/folder:opacity-100 transition-all disabled:opacity-50"
                            >
                              <i className="ri-delete-bin-line mr-1.5"></i>
                              Remove
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden transition-all duration-200 hover:shadow-sm">
          <div className="p-4 flex justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                  Available Skills
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
                variant="ghost"
                size="xs"
                onClick={refreshSkills}
                disabled={isRefreshing}
                className="h-8 rounded-full px-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-800/70 disabled:opacity-60"
              >
                <i className="ri-refresh-line mr-1.5"></i>
                Refresh
              </Button>
            </div>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                placeholder="Search installed skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-9 text-sm bg-white/80 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 dark:text-gray-200 
                  focus-visible:ring-0 focus-visible:ring-offset-0
                  focus-visible:border-blue-500 dark:focus-visible:border-blue-400
                  focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus-visible:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]
                  transition-all duration-200 
                  rounded-xl placeholder:text-muted-foreground/50 shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50">
            <div className="max-h-[360px] overflow-y-auto">
              {filteredSkills.length === 0 && (
                <div className="p-5 text-sm text-gray-500 dark:text-gray-400">
                  {searchQuery ? (
                    <div className="flex flex-col items-start gap-2">
                      <span>No skills match your search.</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchQuery('')}
                        className="px-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Reset search
                      </Button>
                    </div>
                  ) : (
                    'No skills installed yet.'
                  )}
                </div>
              )}
              {filteredSkills.map(skill => {
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
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
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
