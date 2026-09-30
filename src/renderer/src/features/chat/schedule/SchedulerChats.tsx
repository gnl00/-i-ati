import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { getAllChat } from '@renderer/infrastructure/persistence/ChatRepository'
import { ChatTitleSearch } from '../title/ChatTitleSearch'
import { switchWorkspace } from '@renderer/features/workspace'
import { useChatStore } from '../state/chatStore'
import { useSheetStore } from '../state/sheetStore'
import { taskTime } from './ChatScheduleBoard'

export function SchedulerChats(): React.ReactElement {
  const chatList = useChatStore((state) => state.chatList)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openingId, setOpeningId] = useState<number | null>(null)
  const navigationRequest = useRef(0)

  useEffect(() => {
    let active = true
    void getAllChat()
      .then((chats) => {
        if (!active) return
        const current = useChatStore.getState().chatList
        const byUuid = new Map(chats.map((chat) => [chat.uuid, chat]))
        current.forEach((chat) => {
          const persisted = byUuid.get(chat.uuid)
          if (!persisted || chat.updateTime > persisted.updateTime)
            byUuid.set(chat.uuid, chat)
        })
        useChatStore.getState().replaceChatList([...byUuid.values()])
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : 'Unable to load chats',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return (): void => {
      active = false
      navigationRequest.current += 1
    }
  }, [])

  const chats = useMemo(
    () =>
      chatList
        .filter((chat) => chat.isScheduled && chat.id !== -1)
        .sort((a, b) => b.updateTime - a.updateTime),
    [chatList],
  )
  const visibleChats = chats.filter((chat) =>
    chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  const openChat = async (chat: ChatEntity): Promise<void> => {
    if (!chat.id) return
    const request = ++navigationRequest.current
    const epoch = useChatStore.getState().getSelectionEpoch()
    const isCurrent = (): boolean =>
      request === navigationRequest.current &&
      useChatStore.getState().tasksPageOpen &&
      useChatStore.getState().getSelectionEpoch() === epoch &&
      !useSheetStore.getState().sheetOpenState
    setOpeningId(chat.id)
    try {
      if (useChatStore.getState().currentChatUuid !== chat.uuid) {
        const workspace = await switchWorkspace(chat.uuid, chat.workspacePath)
        if (!isCurrent()) return
        if (!workspace.success)
          throw new Error(workspace.error || 'Unable to open workspace')
        await useChatStore.getState().hydrateChat(chat.id, { isCurrent })
      }
      if (!isCurrent() || useChatStore.getState().currentChatUuid !== chat.uuid)
        return
      useChatStore.getState().toggleWebSearch(false)
      useChatStore.getState().setTasksPageOpen(false)
    } catch (reason) {
      if (isCurrent())
        toast.error('Unable to open execution chat', {
          description:
            reason instanceof Error ? reason.message : String(reason),
        })
    } finally {
      if (request === navigationRequest.current) setOpeningId(null)
    }
  }

  return (
    <section aria-label="Chats" className="flex min-h-0 flex-col">
      <div className="mb-3 flex h-8.5 shrink-0 items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-(--app-text-primary)">
          Chats
          <span className="text-[11px] font-normal tabular-nums text-slate-400 dark:text-(--app-text-muted)">
            {loading || error ? '—' : chats.length}
          </span>
        </h2>
        <div className="relative h-8.5 w-8.5 shrink-0">
          <ChatTitleSearch
            open={searchOpen}
            value={query}
            onChange={setQuery}
            onOpen={() => setSearchOpen(true)}
            onClose={() => {
              setSearchOpen(false)
              setQuery('')
            }}
            label="Search chats"
            placeholder="Search titles..."
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-(--app-border-subtle)">
        {loading ? (
          <p role="status" className="p-8 text-center text-xs text-slate-500">
            Loading chats...
          </p>
        ) : error ? (
          <p role="alert" className="p-8 text-center text-xs text-rose-500">
            {error}
          </p>
        ) : visibleChats.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500 dark:text-(--app-text-secondary)">
            {query.trim() ? 'No matching chats' : 'No chats yet'}
          </p>
        ) : (
          visibleChats.map((chat) => (
            <button
              key={chat.uuid}
              type="button"
              disabled={openingId !== null}
              onClick={() => {
                void openChat(chat)
              }}
              aria-label={`Open ${chat.title}`}
              className="flex w-full items-center gap-3 border-b border-(--app-border-subtle) px-4 py-3 text-left last:border-b-0 hover:bg-(--app-surface-hover) active:bg-(--app-surface-inset) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--app-accent) disabled:opacity-50"
            >
              <MessageSquare className="size-3.5 shrink-0 text-slate-400 dark:text-(--app-text-muted)" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700 dark:text-(--app-text-primary)">
                {chat.title}
              </span>
              <time
                dateTime={new Date(chat.updateTime).toISOString()}
                className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-(--app-text-muted)"
              >
                {taskTime(chat.updateTime)}
              </time>
              <ChevronRight className="size-3 shrink-0 text-slate-400" />
            </button>
          ))
        )}
      </div>
    </section>
  )
}
