import { CheckIcon, Cross2Icon, Pencil2Icon } from '@radix-ui/react-icons'
import { Input } from '@renderer/components/ui/input'
import { deleteChat, updateChat } from '@renderer/db/ChatRepository'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  const listRootRef = useRef<HTMLDivElement | null>(null)
  const groupHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [activeGroupName, setActiveGroupName] = useState('')
  const lastActiveGroupRef = useRef<string>('')

  const sortedChatList = useMemo(() => {
    return [...chatList].sort((a, b) => b.updateTime - a.updateTime)
  }, [chatList])

  const groupedChatList = useMemo(() => {
    const groups = new Map<string, ChatEntity[]>()
    sortedChatList.forEach(item => {
      if (item.id === -1) return
      const group = getDateGroup(item.updateTime)
      if (!groups.has(group)) {
        groups.set(group, [])
      }
      groups.get(group)!.push(item)
    })
    return Array.from(groups.entries())
  }, [sortedChatList])
  const effectiveActiveGroup = activeGroupName || groupedChatList[0]?.[0] || ''

  useEffect(() => {
    const root = listRootRef.current
    if (!root || groupedChatList.length === 0) {
      return
    }

    const findScrollParent = (element: HTMLElement): HTMLElement | Window => {
      let parent = element.parentElement
      while (parent) {
        const style = window.getComputedStyle(parent)
        if (/(auto|scroll|overlay)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
          return parent
        }
        parent = parent.parentElement
      }
      return window
    }

    const scrollParent = findScrollParent(root)
    let rafId: number | null = null

    const updateActiveGroup = () => {
      rafId = null
      const thresholdEnter = 48
      const thresholdLeave = 36
      let nextGroup = groupedChatList[0][0]
      const currentGroup = lastActiveGroupRef.current

      if (scrollParent === window) {
        groupedChatList.forEach(([groupName]) => {
          const headerEl = groupHeaderRefs.current[groupName]
          if (!headerEl) return
          const top = headerEl.getBoundingClientRect().top
          const threshold = currentGroup && currentGroup !== groupName ? thresholdEnter : thresholdLeave
          if (top <= threshold) {
            nextGroup = groupName
          }
        })
      } else {
        const parentTop = (scrollParent as HTMLElement).getBoundingClientRect().top
        groupedChatList.forEach(([groupName]) => {
          const headerEl = groupHeaderRefs.current[groupName]
          if (!headerEl) return
          const top = headerEl.getBoundingClientRect().top - parentTop
          const threshold = currentGroup && currentGroup !== groupName ? thresholdEnter : thresholdLeave
          if (top <= threshold) {
            nextGroup = groupName
          }
        })
      }

      lastActiveGroupRef.current = nextGroup
      setActiveGroupName(prev => (prev === nextGroup ? prev : nextGroup))
    }

    const onScroll = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(updateActiveGroup)
    }

    updateActiveGroup()
    if (scrollParent === window) {
      window.addEventListener('scroll', onScroll, { passive: true })
    } else {
      ; (scrollParent as HTMLElement).addEventListener('scroll', onScroll, { passive: true })
    }
    window.addEventListener('resize', onScroll)

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      if (scrollParent === window) {
        window.removeEventListener('scroll', onScroll)
      } else {
        ; (scrollParent as HTMLElement).removeEventListener('scroll', onScroll)
      }
      window.removeEventListener('resize', onScroll)
    }
  }, [groupedChatList])

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

  if (groupedChatList.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400 dark:text-gray-600">
          <p className="text-sm">No chats yet</p>
          <p className="text-xs mt-1">Start a new conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={listRootRef}>
      <div className="sticky top-0 bg-background/98 backdrop-blur-md z-20 pt-3 pb-2 px-3 mb-1 border-b border-gray-200 dark:border-gray-700 shadow-xs">
        <h4
          className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 transition-opacity duration-150"
        >
          {effectiveActiveGroup}
        </h4>
      </div>

      {groupedChatList.map(([groupName, items]) => (
        <div key={groupName} className="mb-2">
          <div
            ref={node => {
              groupHeaderRefs.current[groupName] = node
            }}
            className={cn(
              'px-3',
              effectiveActiveGroup === groupName
                ? 'h-0 overflow-hidden pt-0 pb-0 mb-0 opacity-0 pointer-events-none'
                : 'pt-1 pb-2 mb-1'
            )}
          >
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
              {groupName}
            </h4>
          </div>

          <div className="space-y-0.5 px-1">
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
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer',
                    'transition-all duration-200 ease-out',
                    isActive
                      ? "bg-linear-to-r from-blue-50/80 via-blue-50/30 to-transparent dark:from-blue-900/20 dark:via-blue-900/10 dark:to-transparent after:content-[''] after:absolute after:bottom-0.5 after:left-3 after:w-48 after:h-0.5 after:bg-linear-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:rounded-full hover:from-blue-50/90 hover:via-blue-50/40 dark:hover:from-blue-900/25 dark:hover:via-blue-900/15"
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-xs hover:scale-[1.01]'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    {showChatItemEditConform && chatItemEditId === item.id ? (
                      <Input
                        className="h-7 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent px-0"
                        onClick={e => e.stopPropagation()}
                        onChange={e => onChatItemTitleChange(e, item)}
                        value={item.title}
                        autoFocus
                      />
                    ) : (
                      <span className={cn(
                        'text-sm font-medium text-gray-700 dark:text-gray-300 line-clamp-1 transition-colors duration-200',
                        isHovered && 'text-gray-900 dark:text-gray-100'
                      )}>
                        {item.title}
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-1 h-7 relative w-16">
                    <span
                      className={cn(
                        'absolute inset-0 flex items-center justify-center px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full transition-all duration-200 ease-out',
                        isHovered
                          ? 'opacity-0 scale-75 translate-x-2 pointer-events-none'
                          : 'opacity-100 scale-100 translate-x-0'
                      )}
                    >
                      {item.msgCount ?? 0}
                    </span>

                    <div
                      className={cn(
                        'absolute inset-0 flex items-center gap-1 transition-all duration-200 ease-out',
                        isHovered
                          ? 'opacity-100 scale-100 translate-x-0'
                          : 'opacity-0 scale-75 -translate-x-2 pointer-events-none'
                      )}
                    >
                      {showChatItemEditConform && chatItemEditId === item.id ? (
                        <button
                          onClick={onSheetChatItemEditConformClick}
                          className={cn(
                            'relative p-1.5 rounded-xl',
                            'bg-emerald-50/80 dark:bg-emerald-950/40',
                            'text-emerald-600 dark:text-emerald-400',
                            'border border-emerald-200/50 dark:border-emerald-800/50',
                            'shadow-inner',
                            'transition-all duration-300 ease-out',
                            'hover:scale-110',
                            'hover:bg-emerald-100 dark:hover:bg-emerald-900/50',
                            'hover:shadow-lg hover:shadow-emerald-500/10',
                            'hover:-translate-y-0.5',
                            'active:scale-95 active:shadow-inner active:translate-y-0'
                          )}
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={e => onSheetChatItemEditClick(e, item)}
                          className={cn(
                            'relative p-1.5 rounded-xl',
                            'bg-slate-100/80 dark:bg-slate-800/60',
                            'text-slate-600 dark:text-slate-400',
                            'border border-slate-200/50 dark:border-slate-700/50',
                            'shadow-inner',
                            'transition-all duration-300 ease-out',
                            'hover:scale-110',
                            'hover:bg-slate-200 dark:hover:bg-slate-700',
                            'hover:shadow-lg hover:shadow-slate-500/10',
                            'hover:-translate-y-0.5',
                            'active:scale-95 active:shadow-inner active:translate-y-0'
                          )}
                        >
                          <Pencil2Icon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={e => onSheetChatItemDeleteClick(e, item)}
                        className={cn(
                          'relative p-1.5 rounded-xl',
                          'bg-rose-50/80 dark:bg-rose-950/40',
                          'text-rose-600 dark:text-rose-400',
                          'border border-rose-200/50 dark:border-rose-800/50',
                          'shadow-inner',
                          'transition-all duration-300 ease-out',
                          'hover:scale-110 hover:rotate-90',
                          'hover:bg-rose-100 dark:hover:bg-rose-900/50',
                          'hover:shadow-lg hover:shadow-rose-500/10',
                          'hover:-translate-y-0.5',
                          'active:scale-95 active:shadow-inner active:translate-y-0 active:rotate-90'
                        )}
                      >
                        <Cross2Icon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="py-4 text-center">
        <span className="text-xs text-gray-400 dark:text-gray-600">No more chats</span>
      </div>
    </div>
  )
}

export default ChatTitleList
