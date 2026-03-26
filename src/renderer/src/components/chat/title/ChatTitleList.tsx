import { CheckIcon, Cross2Icon, Pencil2Icon } from '@radix-ui/react-icons'
import { Input } from '@renderer/components/ui/input'
import { deleteChat, updateChat } from '@renderer/db/ChatRepository'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import React, { useMemo, useRef, useState } from 'react'
import { toast as sonnerToast } from 'sonner'

interface ChatTitleListProps {
  onChatClick: (event: React.MouseEvent<HTMLDivElement>, chat: ChatEntity) => void
  onDeletedCurrentChat: () => void
}

const getDate = (timestamp: number): string => {
  const date = new Date(timestamp)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const getDateGroup = (timestamp: number): string => {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000

  if (timestamp >= startOfToday) return 'Today'
  if (timestamp >= startOfYesterday) return 'Yesterday'
  if (timestamp >= startOfWeek) return 'This Week'
  return getDate(timestamp)
}

const ChatTitleList: React.FC<ChatTitleListProps> = ({ onChatClick, onDeletedCurrentChat }) => {
  const chatList = useChatStore(state => state.chatList)
  const setChatList = useChatStore(state => state.setChatList)
  const updateChatList = useChatStore(state => state.updateChatList)
  const setChatTitle = useChatStore(state => state.setChatTitle)
  const chatId = useChatStore(state => state.currentChatId)

  const [sheetChatItemHover, setSheetChatItemHover] = useState(false)
  const [sheetChatItemHoverChatId, setSheetChatItemHoverChatId] = useState<number>()
  const [showChatItemEditConform, setShowChatItemEditConform] = useState<boolean | undefined>(false)
  const [chatItemEditId, setChatItemEditId] = useState<number | undefined>()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const sortedChatList = useMemo(() => {
    return [...chatList].sort((a, b) => b.updateTime - a.updateTime)
  }, [chatList])

  const filteredChatList = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return sortedChatList
    }

    return sortedChatList.filter(item => {
      if (item.id === -1) return false
      return item.title.toLowerCase().includes(normalizedQuery)
    })
  }, [searchQuery, sortedChatList])

  const groupedChatList = useMemo(() => {
    const groups = new Map<string, ChatEntity[]>()
    filteredChatList.forEach(item => {
      if (item.id === -1) return
      const group = getDateGroup(item.updateTime)
      if (!groups.has(group)) {
        groups.set(group, [])
      }
      groups.get(group)!.push(item)
    })
    return Array.from(groups.entries())
  }, [filteredChatList])

  const openSearch = () => {
    setSearchOpen(true)
    window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 120)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
  }

  const onChatItemTitleChange = (event: React.ChangeEvent<HTMLInputElement>, chat: ChatEntity) => {
    chat.title = event.target.value
    updateChat(chat)
    updateChatList(chat)
    if (chat.id === chatId) {
      setChatTitle(chat.title)
    }
  }

  const onMouseOverSheetChat = (nextChatId: number) => {
    setSheetChatItemHover(true)
    setSheetChatItemHoverChatId(nextChatId)
  }

  const onMouseLeaveSheetChat = () => {
    setSheetChatItemHover(false)
    setSheetChatItemHoverChatId(-1)
  }

  const onSheetChatItemDeleteUndo = (chat: ChatEntity) => {
    setChatList([...chatList])
    updateChat(chat)
  }

  const onSheetChatItemDeleteClick = (event: React.MouseEvent<HTMLButtonElement>, chat: ChatEntity) => {
    event.stopPropagation()
    setChatList(chatList.filter(item => item.id !== chat.id))
    deleteChat(chat.id!)
    if (chat.id === chatId) {
      onDeletedCurrentChat()
    }
    sonnerToast.warning('Chat deleted', {
      action: {
        label: 'Undo',
        onClick: () => onSheetChatItemDeleteUndo(chat)
      }
    })
  }

  const onSheetChatItemEditConformClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setShowChatItemEditConform(false)
    setChatItemEditId(undefined)
  }

  const onSheetChatItemEditClick = (event: React.MouseEvent<HTMLButtonElement>, chat: ChatEntity) => {
    event.stopPropagation()
    setShowChatItemEditConform(true)
    if (chatItemEditId) {
      setChatItemEditId(undefined)
    } else {
      setChatItemEditId(chat.id)
    }
  }

  if (sortedChatList.filter(item => item.id !== -1).length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-gray-400 dark:text-gray-600">
          <p className="text-sm">No chats yet</p>
          <p className="mt-1 text-xs">Start a new conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="pointer-events-none sticky top-0 z-30 h-0">
        <motion.div
          initial={false}
          animate={{
            width: searchOpen ? 315 : 30,
            opacity: 1
          }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto absolute top-0 right-2"
        >
          <div className={cn(
            "flex h-8.5 items-center overflow-hidden rounded-lg bg-white/70 backdrop-blur-xl dark:border-gray-700/45 dark:bg-zinc-900/58 ",
            searchOpen && 'border border-gray-200/45 shadow-[0_1px_1px_rgba(15,23,42,0.03)] dark:shadow-[0_1px_1px_rgba(0,0,0,0.14)]'
          )}>
            <button
              type="button"
              onClick={searchOpen ? undefined : openSearch}
              className="h-8.5 w-8.5 shrink-0 flex justify-center items-center text-gray-500 transition-colors hover:bg-black/4 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/6 dark:hover:text-gray-200"
              aria-label="Search chats"
            >
              <Search className="-translate-x-[2px] h-3.5 w-3.5" />
            </button>

            <AnimatePresence initial={false}>
              {searchOpen && (
                <motion.div
                  key="chat-title-search-input"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-w-0 flex-1 items-center"
                >
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Search chats..."
                    className="h-8.5 min-w-0 border-0 bg-transparent pl-1.5 pr-2.5 text-[13px] shadow-none placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={closeSearch}
                    className="mr-1.5 flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-black/4 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/6 dark:hover:text-gray-200"
                    aria-label="Close search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {groupedChatList.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No matching chats</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Try another title keyword</p>
        </div>
      ) : (
        groupedChatList.map(([groupName, items]) => (
          <section key={groupName} className="mb-2">
            <div className="sticky top-0 z-20 border-b border-gray-200/80 bg-background/94 px-3 pt-3 pb-2 backdrop-blur-md dark:border-gray-700/80">
              <h4 className="truncate text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                {groupName}
              </h4>
            </div>

            <div className="space-y-0.5 px-1 pt-1">
              {items.map(item => {
                const isHovered = sheetChatItemHover && sheetChatItemHoverChatId === item.id
                const isActive = item.id === chatId

                return (
                  <div
                    key={item.id}
                    id="chat-item"
                    onMouseOver={() => onMouseOverSheetChat(item.id as number)}
                    onMouseLeave={onMouseLeaveSheetChat}
                    onClick={event => onChatClick(event, item)}
                    className={cn(
                      'group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                      'transition-all duration-200 ease-out',
                      isActive
                        ? "bg-linear-to-r from-blue-50/80 via-blue-50/30 to-transparent after:absolute after:bottom-0.5 after:left-3 after:h-0.5 after:w-48 after:rounded-full after:bg-linear-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:content-[''] hover:from-blue-50/90 hover:via-blue-50/40 dark:from-blue-900/20 dark:via-blue-900/10 dark:to-transparent dark:hover:from-blue-900/25 dark:hover:via-blue-900/15"
                        : 'hover:scale-[1.01] hover:bg-gray-100 hover:shadow-xs dark:hover:bg-gray-800'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      {showChatItemEditConform && chatItemEditId === item.id ? (
                        <Input
                          className="h-7 border-0 bg-transparent px-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                          onClick={e => e.stopPropagation()}
                          onChange={e => onChatItemTitleChange(e, item)}
                          value={item.title}
                          autoFocus
                        />
                      ) : (
                        <span
                          className={cn(
                            'line-clamp-1 text-sm font-medium text-gray-700 transition-colors duration-200 dark:text-gray-300',
                            isHovered && 'text-gray-900 dark:text-gray-100'
                          )}
                        >
                          {item.title}
                        </span>
                      )}
                    </div>

                    <div className="relative flex h-7 w-16 shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          'absolute inset-0 flex items-center justify-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 transition-all duration-200 ease-out dark:bg-gray-800 dark:text-gray-400',
                          isHovered
                            ? 'pointer-events-none translate-x-2 scale-75 opacity-0'
                            : 'translate-x-0 scale-100 opacity-100'
                        )}
                      >
                        {item.msgCount ?? 0}
                      </span>

                      <div
                        className={cn(
                          'absolute inset-0 flex items-center gap-1 transition-all duration-200 ease-out',
                          isHovered
                            ? 'translate-x-0 scale-100 opacity-100'
                            : 'pointer-events-none -translate-x-2 scale-75 opacity-0'
                        )}
                      >
                        {showChatItemEditConform && chatItemEditId === item.id ? (
                          <button
                            onClick={onSheetChatItemEditConformClick}
                            className={cn(
                              'relative rounded-xl border border-emerald-200/50 bg-emerald-50/80 p-1.5 text-emerald-600 shadow-inner transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-110 hover:bg-emerald-100 hover:shadow-lg hover:shadow-emerald-500/10 active:translate-y-0 active:scale-95 active:shadow-inner dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
                            )}
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={e => onSheetChatItemEditClick(e, item)}
                            className={cn(
                              'relative rounded-xl border border-slate-200/50 bg-slate-100/80 p-1.5 text-slate-600 shadow-inner transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-110 hover:bg-slate-200 hover:shadow-lg hover:shadow-slate-500/10 active:translate-y-0 active:scale-95 active:shadow-inner dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-700'
                            )}
                          >
                            <Pencil2Icon className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={e => onSheetChatItemDeleteClick(e, item)}
                          className={cn(
                            'relative rounded-xl border border-rose-200/50 bg-rose-50/80 p-1.5 text-rose-600 shadow-inner transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-110 hover:rotate-90 hover:bg-rose-100 hover:shadow-lg hover:shadow-rose-500/10 active:translate-y-0 active:scale-95 active:rotate-90 active:shadow-inner dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/50'
                          )}
                        >
                          <Cross2Icon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}

      <div className="py-4 text-center">
        <span className="text-xs text-gray-400 dark:text-gray-600">No more chats</span>
      </div>
    </div>
  )
}

export default ChatTitleList
