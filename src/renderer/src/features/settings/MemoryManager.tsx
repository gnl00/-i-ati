import React, { useEffect, useId, useRef, useState } from 'react'
import { Brain, RefreshCw } from 'lucide-react'
import InlineDeleteConfirm from './common/InlineDeleteConfirm'
import { Label } from '@renderer/shared/components/ui/label'
import { Switch } from '@renderer/shared/components/ui/switch'
import { toast } from 'sonner'
import { MEMORY_DELETE, MEMORY_GET_ALL } from '@shared/constants'
import {
  SettingsEmptyState,
  SettingsList,
  SettingsListItem,
  SettingsPageShell,
  SettingsSectionHeader,
  SettingsSubsectionHeader,
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
  metadata?: Record<string, unknown>
}

const roleLabels: Record<string, string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System'
}

const MemoryContent: React.FC<{ text: string }> = ({ text }) => {
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
    <>
      <p
        ref={paragraph}
        id={id}
        className={`whitespace-pre-wrap break-words text-[12px] leading-relaxed text-gray-700 dark:text-(--app-text-body) ${expanded ? '' : 'line-clamp-2'}`}
      >
        {text}
      </p>
      {(truncated || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[11px] text-gray-500 hover:text-gray-800 dark:text-(--app-text-secondary) dark:hover:text-(--app-text-primary)"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}

const MemoryManager: React.FC<MemoryManagerProps> = ({
  memoryEnabled,
  setMemoryEnabled
}) => {
  const [memoryItems, setMemoryItems] = useState<MemoryListEntry[]>([])
  const [isMemoryLoading, setIsMemoryLoading] = useState(false)

  const loadMemories = async (): Promise<void> => {
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

  const handleDeleteMemory = async (id: string): Promise<void> => {
    try {
      await window.electron.ipcRenderer.invoke(MEMORY_DELETE, id)
      setMemoryItems((prev) => prev.filter((item) => item.id !== id))
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
    <SettingsPageShell contentClassName="gap-2">
      <SettingsSectionHeader
        className="items-center"
        title={
          <Label htmlFor="toggle-memory" className="cursor-default">
            Long-term Memory
          </Label>
        }
        description="Remembers important context across conversations."
        actions={
          <Switch
            checked={memoryEnabled}
            onCheckedChange={setMemoryEnabled}
            id="toggle-memory"
          />
        }
      />

      <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
        <SettingsSubsectionHeader
          title="Stored Memories"
          className="items-center border-t-0 bg-transparent px-3 dark:bg-transparent"
          badges={
            <span className="text-[11px] text-gray-400 dark:text-(--app-text-muted)">
              {memoryItems.length} stored
            </span>
          }
          actions={
            <button
              onClick={() => void loadMemories()}
              disabled={isMemoryLoading}
              className={settingsSecondaryButtonClassName}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isMemoryLoading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          }
        />

        <SettingsList className="bg-transparent dark:bg-transparent">
          {memoryItems.length === 0 ? (
            <SettingsEmptyState
              icon={<Brain className="h-4 w-4" />}
              title={
                isMemoryLoading ? 'Loading memories…' : 'No memories stored'
              }
              description={
                isMemoryLoading
                  ? undefined
                  : 'Enable memory above and start a conversation.'
              }
            />
          ) : (
            memoryItems.map((item) => {
              const role = roleLabels[item.role] ?? roleLabels.system
              return (
                <SettingsListItem key={item.id} className="gap-3 px-3">
                  <div className="min-w-0 flex-1">
                    <MemoryContent text={item.context_origin} />
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-(--app-text-muted)">
                      <span>{role}</span>
                      <time dateTime={new Date(item.timestamp).toISOString()}>
                        {new Date(item.timestamp).toLocaleString()}
                      </time>
                    </div>
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
      </div>
    </SettingsPageShell>
  )
}

export default MemoryManager
