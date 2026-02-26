import React, { useEffect, useState } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Trash2 } from 'lucide-react'
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

const MemoryManager: React.FC<MemoryManagerProps> = ({
  memoryEnabled,
  setMemoryEnabled
}) => {
  const [memoryItems, setMemoryItems] = useState<MemoryListEntry[]>([])
  const [isMemoryLoading, setIsMemoryLoading] = useState(false)

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
    <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
      <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500'>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="p-5 flex items-start gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="toggle-memory" className="text-base font-medium text-gray-900 dark:text-gray-100">
                  Long-term Memory
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                  MEMORY
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Enable semantic memory storage and retrieval using vector embeddings. The system can remember important information across conversations.
              </p>
            </div>
            <Switch
              checked={memoryEnabled}
              onCheckedChange={setMemoryEnabled}
              id="toggle-memory"
              className="data-[state=checked]:bg-green-600 mt-1"
            />
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="p-4 flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Stored Memories
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadMemories}
                className="h-8 rounded-full px-3 text-xs font-medium shadow-none border-gray-200/80 dark:border-gray-700/70 bg-white/70 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/70"
                disabled={isMemoryLoading}
              >
                <i className="ri-refresh-line mr-1.5"></i>
                Refresh
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              {memoryItems.length === 0 ? (
                <div className="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400">
                  {isMemoryLoading ? 'Loading memories...' : 'No memories stored.'}
                </div>
              ) : (
                memoryItems.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-1">
                        <span className="uppercase">{item.role}</span>
                        <span>•</span>
                        <span>Chat {item.chatId}</span>
                        <span>•</span>
                        <span>{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-gray-800 dark:text-gray-200 line-clamp-2">
                        {item.context_origin}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-red-500"
                      onClick={() => handleDeleteMemory(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MemoryManager
