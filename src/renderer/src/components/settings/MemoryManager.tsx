import React, { useEffect, useState } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import InlineDeleteConfirm from './common/InlineDeleteConfirm'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { toast } from 'sonner'
import { MEMORY_DELETE, MEMORY_GET_ALL } from '@shared/constants'
import {
  SettingsEmptyState,
  SettingsList,
  SettingsListItem,
  SettingsPageShell,
  SettingsSectionHeader,
  SettingsToolbar,
  SettingsToolbarLabel,
  settingsSecondaryButtonClassName
} from './common/SettingsLayout'

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
    <SettingsPageShell>
      <SettingsSectionHeader
        title={(
          <Label htmlFor="toggle-memory" className="cursor-default">
            Long-term Memory
          </Label>
        )}
        badges={(
          <>
            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-indigo-600 border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800">
              MEMORY
            </Badge>
          </>
        )}
        description="Semantic memory storage and retrieval using vector embeddings. Remembers important context across conversations."
        actions={(
          <Switch
            checked={memoryEnabled}
            onCheckedChange={setMemoryEnabled}
            id="toggle-memory"
            className="data-[state=checked]:bg-indigo-600 mt-0.5 shrink-0"
          />
        )}
      />

      <SettingsToolbar className="flex items-center justify-between gap-3">
        <SettingsToolbarLabel>Stored Memories ({memoryItems.length} stored)</SettingsToolbarLabel>
        <button
          onClick={loadMemories}
          disabled={isMemoryLoading}
          className={settingsSecondaryButtonClassName}
        >
          <i className={`ri-refresh-line text-[12px] ${isMemoryLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </SettingsToolbar>

      <SettingsList className="bg-transparent dark:bg-transparent">
        {memoryItems.length === 0 ? (
          <SettingsEmptyState
            icon={<i className="ri-brain-line text-[15px] text-gray-400 dark:text-gray-500" />}
            title={isMemoryLoading ? 'Loading memories…' : 'No memories stored'}
            description={isMemoryLoading ? undefined : 'Enable memory above and start a conversation.'}
          />
        ) : (
          memoryItems.map(item => {
            const role = roleMeta[item.role] ?? roleMeta.system
            return (
              <SettingsListItem
                key={item.id}
                className="gap-3"
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
                <InlineDeleteConfirm
                  onConfirm={() => handleDeleteMemory(item.id)}
                  ariaLabel="Delete memory"
                  revealOnGroupHover
                />
              </SettingsListItem>
            )
          })
        )}
      </SettingsList>
    </SettingsPageShell>
  )
}

export default MemoryManager
