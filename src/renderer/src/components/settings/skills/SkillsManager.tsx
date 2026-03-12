import React, { useEffect, useMemo, useState } from 'react'
import { listInstalledSkills } from '@renderer/services/skills/SkillService'
import { getChatSkills } from '@renderer/db/ChatSkillRepository'
import { useChatStore } from '@renderer/store'
import { invokeCheckIsDirectory, invokeImportSkills, invokeSelectDirectory } from '@renderer/invoker/ipcInvoker'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { toast } from 'sonner'
import { invokeDeleteSkill } from '@renderer/invoker/ipcInvoker'
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Search, X } from 'lucide-react'

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
  const { currentChatId } = useChatStore()
  const { appConfig, setAppConfig } = useAppConfigStore()
  const [skills, setSkills] = useState<SkillMetadata[]>([])
  const [activeSkills, setActiveSkills] = useState<string[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [pendingFolders, setPendingFolders] = useState<Set<string>>(new Set())
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const activeCount = activeSkills.length

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
    if (!currentChatId) { setActiveSkills([]); return }
    try {
      const result = await getChatSkills(currentChatId)
      setActiveSkills(result)
    } catch (error) {
      console.error('[SkillsManager] Failed to load active skills:', error)
      toast.error('Failed to load active skills')
    }
  }

  useEffect(() => { refreshSkills() }, [])
  useEffect(() => { refreshActiveSkills() }, [currentChatId])
  useEffect(() => {
    setFolders(appConfig.skills?.folders || [])
  }, [appConfig.skills?.folders])

  const updateFolders = (nextFolders: string[]) => {
    setFolders(nextFolders)
    void setAppConfig({ ...appConfig, skills: { ...(appConfig.skills || {}), folders: nextFolders } })
  }

  const setFolderPending = (folder: string, pending: boolean) => {
    setPendingFolders(prev => {
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
    } catch (error: any) {
      console.error('[SkillsManager] Import failed:', error)
      toast.error(error.message || 'Failed to import skills')
    } finally {
      setFolderPending(folder, false)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    const result = await invokeSelectDirectory()
    if (!result.success || !result.path) return
    const nextFolders = folders.includes(result.path) ? folders : [...folders, result.path]
    updateFolders(nextFolders)
    await scanFolder(result.path)
  }

  const handleRemoveFolder = (folder: string) => {
    updateFolders(folders.filter(item => item !== folder))
  }

  const scanAllFolders = async (): Promise<void> => {
    if (folders.length === 0) return
    setPendingFolders(new Set(folders))
    try {
      const directoryChecks = await Promise.allSettled(folders.map(f => invokeCheckIsDirectory(f)))
      const validFolders: string[] = []
      const invalidFolders: string[] = []

      directoryChecks.forEach((checkResult, index) => {
        const folder = folders[index]
        if (checkResult.status !== 'fulfilled') { invalidFolders.push(folder); return }
        const payload = checkResult.value
        payload.success && payload.isDirectory ? validFolders.push(folder) : invalidFolders.push(folder)
      })

      if (invalidFolders.length > 0) {
        updateFolders(folders.filter(f => !invalidFolders.includes(f)))
        toast.error(`Removed invalid folder path(s):\n${invalidFolders.map(p => `• ${p}`).join('\n')}`)
      }

      if (validFolders.length === 0) {
        toast.error('No valid skill folders found.')
        return
      }

      const results = await Promise.allSettled(validFolders.map(f => invokeImportSkills(f)))
      let installedCount = 0, renamedCount = 0, failedCount = invalidFolders.length

      results.forEach(result => {
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

      failedCount > 0 ? toast.error(`Rescan: ${summary}`) : toast.success(`Rescan: ${summary}`)
      await refreshSkills()
      await refreshActiveSkills()
    } catch (error: any) {
      console.error('[SkillsManager] Rescan failed:', error)
      toast.error(error.message || 'Failed to rescan folders')
    } finally {
      setPendingFolders(new Set())
    }
  }

  const handleDeleteSkill = async (name: string): Promise<void> => {
    try {
      await invokeDeleteSkill(name)
      toast.success(`Removed skill: ${name}`)
      setConfirmingDeleteId(null)
      await refreshSkills()
      await refreshActiveSkills()
    } catch (error: any) {
      console.error('[SkillsManager] Failed to delete skill:', error)
      toast.error(error?.message || `Failed to remove skill: ${name}`)
    }
  }

  return (
    <div className="w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0">
      <div className="w-full h-full p-1 pr-2">
        <div className="h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden flex flex-col">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="px-4 py-4 flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Skills
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                  {skills.length} installed
                </Badge>
                {activeCount > 0 && (
                  <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                    {activeCount} active
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Manage skill folders and toggle skills for the current chat.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={scanAllFolders}
                disabled={folders.length === 0 || pendingFolders.size > 0}
                className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150"
              >
                <i className="ri-refresh-line text-[12px]" />
                Rescan
              </button>
              <button
                onClick={handleAddFolder}
                className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10"
              >
                <i className="ri-folder-add-line text-[12px]" />
                Add Folder
              </button>
            </div>
          </div>

          {/* ── Folders strip ───────────────────────────────────── */}
          <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-2.5 bg-gray-50/40 dark:bg-gray-900/20 flex items-center gap-2 flex-wrap min-h-[40px]">
            {folders.length === 0 ? (
              <span className="text-[11px] text-gray-400/70 dark:text-gray-600 italic">
                No folders added — click Add Folder to scan for skills.
              </span>
            ) : (
              <>
                {folders.map(folder => {
                  const isPending = pendingFolders.has(folder)
                  const short = folder.split('/').pop() || folder
                  return (
                    <div
                      key={folder}
                      title={folder}
                      className="group/f flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-md bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/60 max-w-[220px] transition-colors duration-150 hover:border-gray-300 dark:hover:border-gray-600"
                    >
                      <i className={`ri-folder-3-line text-[12px] shrink-0 ${isPending ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`} />
                      <span className="font-mono text-[10.5px] text-gray-600 dark:text-gray-300 truncate">
                        {short}
                      </span>
                      {isPending ? (
                        <span className="text-[9px] text-amber-500 shrink-0 pr-1">…</span>
                      ) : (
                        <button
                          onClick={() => handleRemoveFolder(folder)}
                          className="h-4 w-4 flex items-center justify-center rounded text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover/f:opacity-100 transition-all duration-150 shrink-0"
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
          </div>

          {/* ── Search ──────────────────────────────────────────── */}
          <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-2.5 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              <Input
                placeholder="Search skills... Enter to search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-8 text-[12px] bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700/60 dark:text-gray-200
                  focus-visible:ring-0 focus-visible:ring-offset-0
                  focus-visible:border-emerald-400 dark:focus-visible:border-emerald-600
                  transition-all duration-200 rounded-lg placeholder:text-gray-400/60 dark:placeholder:text-gray-600 shadow-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              onClick={refreshSkills}
              disabled={isRefreshing}
              className="h-8 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-40 transition-all duration-150 shrink-0"
            >
              <i className={`ri-refresh-line text-[12px] ${isRefreshing ? 'animate-spin' : ''}`} />
              Reload
            </button>
          </div>

          {/* ── Skills list ─────────────────────────────────────── */}
          <div className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/40 dark:bg-gray-900/30 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">

              {filteredSkills.length === 0 && (
                <div className="py-10 flex flex-col items-center gap-2.5 text-center">
                  {searchQuery ? (
                    <>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No skills match</p>
                        <p className="text-[11.5px] text-gray-400 dark:text-gray-500">
                          Try a different keyword or{' '}
                          <button
                            onClick={() => setSearchQuery('')}
                            className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            clear search
                          </button>
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <i className="ri-magic-line text-[15px] text-gray-400 dark:text-gray-500" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No skills installed</p>
                        <p className="text-[11.5px] text-gray-400 dark:text-gray-500">Add a folder above to scan for skills.</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {filteredSkills.map(skill => {
                const isActive = activeSkills.includes(skill.name)
                return (
                  <div
                    key={skill.name}
                    className="group flex items-start justify-between gap-4 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800/70 last:border-b-0 hover:bg-white/70 dark:hover:bg-gray-800/40 transition-colors duration-150"
                  >
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">
                          {skill.name}
                        </span>
                        {isActive && (
                          <Badge variant="secondary" className="text-[9.5px] h-[18px] px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                            Active
                          </Badge>
                        )}
                        {skill.allowedTools && skill.allowedTools.length > 0 && (
                          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-blue-600 border-blue-200/80 bg-blue-50/80 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/60">
                            {skill.allowedTools.length} tools
                          </Badge>
                        )}
                      </div>
                      {skill.description && (
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
                          {skill.description}
                        </p>
                      )}
                      {skill.allowedTools && skill.allowedTools.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {skill.allowedTools.map(tool => (
                            <span
                              key={tool}
                              className="inline-flex px-1.5 py-0.5 rounded font-mono text-[9.5px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/60"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}
                      {skill.compatibility && (
                        <p className="text-[10.5px] text-gray-400 dark:text-gray-500 italic">
                          {skill.compatibility}
                        </p>
                      )}
                    </div>
                    <div className="relative shrink-0" style={{ width: 66, height: 24, marginTop: 2 }}>
                      {/* Switch temporarily disabled — skill activation requires an open chat (chat_uuid binding) */}
                      {/* <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => toggleSkillActive(skill.name, checked)}
                        disabled={isPending}
                        className="data-[state=checked]:bg-emerald-600 scale-90 origin-center disabled:opacity-40"
                      /> */}
                      {/* Trash icon —— 确认时淡出缩小 */}
                      <button
                        onClick={() => setConfirmingDeleteId(skill.name)}
                        aria-label="Remove skill"
                        tabIndex={confirmingDeleteId === skill.name ? -1 : 0}
                        className="absolute inset-0 flex items-center justify-center rounded text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        style={{
                          transition: 'opacity 140ms ease, transform 140ms ease, background-color 120ms ease, color 120ms ease',
                          ...(confirmingDeleteId === skill.name && {
                            opacity: 0,
                            transform: 'scale(0.7)',
                            pointerEvents: 'none',
                          }),
                        }}
                      >
                        <i className="ri-delete-bin-line text-[13px]" />
                      </button>

                      {/* No | Yes —— 原地淡入 */}
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          transition: 'opacity 160ms ease 30ms, transform 160ms ease 30ms',
                          opacity: confirmingDeleteId === skill.name ? 1 : 0,
                          transform: confirmingDeleteId === skill.name ? 'scale(1)' : 'scale(0.75)',
                          pointerEvents: confirmingDeleteId === skill.name ? 'auto' : 'none',
                        }}
                      >
                        <button
                          onClick={() => setConfirmingDeleteId(null)}
                          tabIndex={confirmingDeleteId === skill.name ? 0 : -1}
                          className="h-[22px] px-2 text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-l-md border border-gray-200 dark:border-gray-700 border-r-0"
                          style={{ transition: 'background-color 120ms ease, color 120ms ease' }}
                        >
                          No
                        </button>
                        <button
                          onClick={() => handleDeleteSkill(skill.name)}
                          tabIndex={confirmingDeleteId === skill.name ? 0 : -1}
                          className="h-[22px] px-2 text-[11px] font-medium text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-r-md border border-gray-200 dark:border-gray-700"
                          style={{ transition: 'background-color 120ms ease, color 120ms ease' }}
                        >
                          Yes
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

          </div>

        </div>
      </div>
    </div>
  )
}

export default SkillsManager
