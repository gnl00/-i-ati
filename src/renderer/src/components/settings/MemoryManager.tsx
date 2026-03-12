import React, { useEffect, useState } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { toast } from 'sonner'
import { MEMORY_DELETE, MEMORY_GET_ALL } from '@shared/constants'

interface MemoryManagerProps {
  memoryEnabled: boolean
  setMemoryEnabled: (value: boolean) => void
}

interface MemoryListEntry {
  id: string
  chatId: number
  messageId: number
  role: 'user' | 'assistant' | 'system'
  context_origin: string
  context_en: string
  timestamp: number
  metadata?: Record<string, any>
}

const roleMeta: Record<string, { label: string; className: string }> = {
  user: {
    label: 'User',
    className: 'text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/60'
  },
  assistant: {
    label: 'Assistant',
    className: 'text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/60'
  },
  system: {
    label: 'System',
    className: 'text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
  }
}

const MemoryManager: React.FC<MemoryManagerProps> = ({
  memoryEnabled,
  setMemoryEnabled
}) => {
  const [memoryItems, setMemoryItems] = useState<MemoryListEntry[]>([])
  const [isMemoryLoading, setIsMemoryLoading] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const loadMemories = async () => {
    setIsMemoryLoading(true)
    try {
      const items = await window.electron.ipcRenderer.invoke(MEMORY_GET_ALL)
      setMemoryItems(Array.isArray(items) ? items : [])
    } catch (error) {
      console.error('[MemoryManager] Failed to load memories:', error)
      toast.error('Failed to load memories')
    } finally {
      setIsMemoryLoading(false)
    }
  }

  const handleDeleteMemory = async (id: string) => {
    try {
      await window.electron.ipcRenderer.invoke(MEMORY_DELETE, id)
      setMemoryItems(prev => prev.filter(item => item.id !== id))
      setConfirmingDeleteId(null)
      toast.success('Memory deleted')
    } catch (error) {
      console.error('[MemoryManager] Failed to delete memory:', error)
      toast.error('Failed to delete memory')
    }
  }

  useEffect(() => {
    void loadMemories()
  }, [])

  return (
    <div className="w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0">
      <div className="w-full h-full p-1 pr-2">
        <div className="h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden flex flex-col">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="px-4 py-4 flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="toggle-memory" className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Long-term Memory
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                  MEMORY
                </Badge>
                {memoryItems.length > 0 && (
                  <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                    {memoryItems.length} stored
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Semantic memory storage and retrieval using vector embeddings. Remembers important context across conversations.
              </p>
            </div>
            <Switch
              checked={memoryEnabled}
              onCheckedChange={setMemoryEnabled}
              id="toggle-memory"
              className="data-[state=checked]:bg-emerald-600 mt-0.5 shrink-0"
            />
          </div>

          {/* ── List header ─────────────────────────────────────── */}
          <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-2.5 bg-gray-50/40 dark:bg-gray-900/20 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Stored Memories
            </span>
            <button
              onClick={loadMemories}
              disabled={isMemoryLoading}
              className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150"
            >
              <i className={`ri-refresh-line text-[12px] ${isMemoryLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* ── Memory list ─────────────────────────────────────── */}
          <div className="border-t border-gray-100 dark:border-gray-700/50 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {memoryItems.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2.5 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <i className="ri-brain-line text-[15px] text-gray-400 dark:text-gray-500" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">
                    {isMemoryLoading ? 'Loading memories…' : 'No memories stored'}
                  </p>
                  {!isMemoryLoading && (
                    <p className="text-[11.5px] text-gray-400 dark:text-gray-500">
                      Enable memory above and start a conversation.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              memoryItems.map(item => {
                const role = roleMeta[item.role] ?? roleMeta.system
                return (
                  <div
                    key={item.id}
                    className="group flex items-start gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800/70 last:border-b-0 hover:bg-white/70 dark:hover:bg-gray-800/40 transition-colors duration-150"
                  >
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-medium border ${role.className}`}>
                          {role.label}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-2">
                        {item.context_origin}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 pt-0.5 shrink-0">
                      {confirmingDeleteId === item.id ? (
                        <>
                          <button
                            onClick={() => setConfirmingDeleteId(null)}
                            className="h-6 px-2 rounded text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all duration-150"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDeleteMemory(item.id)}
                            className="h-6 px-2 rounded text-[11px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all duration-150"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmingDeleteId(item.id)}
                          className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all duration-150"
                          aria-label="Delete memory"
                        >
                          <i className="ri-delete-bin-line text-[13px]" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default MemoryManager
