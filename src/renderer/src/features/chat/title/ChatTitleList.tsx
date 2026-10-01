import { createPortal } from 'react-dom'
import { useSheetStore } from '../state/sheetStore'
import { Folder, FolderOpen, History, BadgePlus } from 'lucide-react'
import { projectChatWorkspaceGroups } from './chatWorkspaceGroups'
import { CheckIcon, Cross2Icon, Pencil2Icon } from '@radix-ui/react-icons'
import { Input } from '@renderer/shared/components/ui/input'
import { deleteChat, updateChat } from '@renderer/infrastructure/persistence/ChatRepository'
import { invokeDbChatSearch } from '@renderer/infrastructure/ipc'
import { cn } from '@renderer/shared/lib/utils'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { parseChatSearchHighlights } from '@shared/search/chatSearchHighlights'
import { ChatSearch } from './ChatSearch'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast as sonnerToast } from 'sonner'

interface ChatTitleListProps {
  onNewWorkspaceChat?: (path?: string) => void
  searchContainer?: HTMLElement | null
  onChatClick: (event: React.MouseEvent<HTMLDivElement>, result: ChatSearchResult) => void
  onDeletedCurrentChat: () => void
}

const SEARCH_RESULT_LIMIT = 50

type TelegramBadgeMeta = {
  label: string
  peerType?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlightedText(
  text: string,
  query: string,
  highlightClassName: string
): React.ReactNode {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return text
  }

  const matcher = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'ig')
  const parts = text.split(matcher)

  return parts.map((part, index) => {
    if (part.toLowerCase() !== normalizedQuery.toLowerCase()) {
      return <React.Fragment key={`highlight-part-${index}`}>{part}</React.Fragment>
    }

    return (
      <mark
        key={`highlight-part-${index}`}
        className={highlightClassName}
      >
        {part}
      </mark>
    )
  })
}

function renderHighlightedTitle(title: string, query: string): React.ReactNode {
  return renderHighlightedText(
    title,
    query,
    'rounded bg-blue-100 px-0.5 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100'
  )
}

function renderHighlightedSnippet(snippet: string, query: string): React.ReactNode {
  const ftsParts = parseChatSearchHighlights(snippet)
  if (ftsParts.some(part => part.highlighted)) {
    return ftsParts.map((part, index) => {
      if (!part.highlighted) {
        return <React.Fragment key={`fts-highlight-part-${index}`}>{part.text}</React.Fragment>
      }

      return (
        <mark
          key={`fts-highlight-part-${index}`}
          className="rounded bg-amber-200/80 px-0.5 text-gray-800 dark:bg-amber-500/25 dark:text-amber-100"
        >
          {part.text}
        </mark>
      )
    })
  }

  return renderHighlightedText(
    snippet,
    query,
    'rounded bg-amber-200/80 px-0.5 text-gray-800 dark:bg-amber-500/25 dark:text-amber-100'
  )
}

function formatSearchResultDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const year = date.getFullYear()
  const currentYear = now.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfTargetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfTargetDay) / (24 * 60 * 60 * 1000))

  if (dayDiff === 0) {
    return `Today ${hours}:${minutes}`
  }

  if (dayDiff === 1) {
    return `Yesterday ${hours}:${minutes}`
  }

  if (year === currentYear) {
    return `${month}-${day} ${hours}:${minutes}`
  }

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function getSearchResultTimestamp(result: ChatSearchResult): number {
  return result.matchedTimestamp ?? result.chat.updateTime
}

function getSearchResultHitCount(result: ChatSearchResult): number {
  switch (result.matchSource) {
    case 'title+message':
      return result.messageHitCount + 1
    case 'title':
      return 1
    case 'message':
    default:
      return Math.max(result.messageHitCount, 1)
  }
}

function formatHitCountLabel(hitCount: number): string {
  return `${hitCount === 1 ? '' : '+'}${hitCount}`
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getTelegramBadgeMeta(chat: ChatEntity): TelegramBadgeMeta | undefined {
  const binding = chat.hostBindings?.find(item => item.hostType === 'telegram' && item.status === 'active')
  if (!binding) {
    return undefined
  }

  const username = getMetadataString(binding.metadata, 'username')?.replace(/^@/, '')
  const displayName = getMetadataString(binding.metadata, 'displayName')
  const chatType = getMetadataString(binding.metadata, 'chatType')

  if (username) {
    return {
      label: `@${username}`,
      peerType: chatType
    }
  }

  if (displayName) {
    return {
      label: displayName,
      peerType: chatType
    }
  }

  if (chatType === 'group' || chatType === 'supergroup') {
    return {
      label: 'Group',
      peerType: chatType
    }
  }

  if (chatType === 'channel') {
    return {
      label: 'Channel',
      peerType: chatType
    }
  }

  return {
    label: 'Telegram',
    peerType: chatType
  }
}

function TelegramChatBadge({ meta, compact = false }: { meta?: TelegramBadgeMeta; compact?: boolean }): React.ReactNode {
  if (!meta) {
    return null
  }

  const peerLabel = meta.peerType === 'group' || meta.peerType === 'supergroup'
    ? 'Group'
    : meta.peerType === 'channel'
      ? 'Channel'
      : undefined

  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 text-[11px] leading-none text-gray-500 dark:text-(--app-text-secondary)',
        compact && 'text-[10.5px]'
      )}
      title={`Telegram ${meta.label}`}
    >
      <span className="shrink-0 rounded-[5px] border border-sky-200/70 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300">
        TG
      </span>
      <span className="min-w-0 truncate">{meta.label}</span>
      {peerLabel && (
        <span className="shrink-0 text-gray-400 dark:text-(--app-text-muted)">{peerLabel}</span>
      )}
    </span>
  )
}

const ChatTitleList: React.FC<ChatTitleListProps> = ({ onChatClick, onDeletedCurrentChat, searchContainer, onNewWorkspaceChat }) => {
  const chatList = useChatStore(state => state.chatList)
  const removeChatListEntry = useChatStore(state => state.removeChatListEntry)
  const updateChatList = useChatStore(state => state.updateChatList)
  const chatId = useChatStore(state => state.currentChatId)

  const [showChatItemEditConform, setShowChatItemEditConform] = useState<boolean | undefined>(false)
  const [chatItemEditId, setChatItemEditId] = useState<number | undefined>()
  const collapsedGroups = useSheetStore(state => state.collapsedChatGroups)
  const toggleChatGroup = useSheetStore(state => state.toggleChatGroup)
  const [visibleGroupCounts, setVisibleGroupCounts] = useState<Record<string, number>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchRequestIdRef = useRef(0)

  const sortedChatList = useMemo(() => {
    return chatList.filter(chat => !chat.isScheduled).sort((a, b) => b.updateTime - a.updateTime)
  }, [chatList])

  const titleListResults = useMemo<ChatSearchResult[]>(() => {
    return sortedChatList
      .filter(item => item.id !== -1)
      .map(item => ({
        chat: item,
        matchSource: 'title',
        messageHitCount: 0,
        score: item.updateTime
      }))
  }, [sortedChatList])

  const isSearchMode = searchQuery.trim().length > 0
  const displayResults = isSearchMode ? searchResults : titleListResults
  const listTopPaddingClass = 'pt-1'

  const groupedChatList = useMemo(() => isSearchMode ? [] : projectChatWorkspaceGroups(displayResults), [displayResults, isSearchMode])

  useEffect(() => {
    const normalizedQuery = searchQuery.trim()
    const requestId = ++searchRequestIdRef.current

    if (!normalizedQuery) {
      setSearchLoading(false)
      setSearchError('')
      setSearchResults([])
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSearchLoading(true)
      setSearchError('')
      void invokeDbChatSearch({
        scope: 'regular',
        query: normalizedQuery,
        limit: SEARCH_RESULT_LIMIT
      }).then(results => {
        if (searchRequestIdRef.current !== requestId) {
          return
        }
        setSearchResults(results)
      }).catch(error => {
        if (searchRequestIdRef.current !== requestId) {
          return
        }
        setSearchError(error instanceof Error ? error.message : 'Failed to search chats')
        setSearchResults([])
      }).finally((): void => {
        if (searchRequestIdRef.current !== requestId) {
          return
        }
        setSearchLoading(false)
      })
    }, 180)

    return (): void => {
      window.clearTimeout(timeoutId)
    }
  }, [searchQuery])

  const openSearch = (): void => {
    setSearchOpen(true)
  }

  const closeSearch = (): void => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchError('')
    setSearchResults([])
  }

  const onChatItemTitleChange = (event: React.ChangeEvent<HTMLInputElement>, chat: ChatEntity): void => {
    chat.title = event.target.value
    updateChat(chat)
    updateChatList(chat)
  }

  const onSheetChatItemDeleteUndo = (chat: ChatEntity): void => {
    updateChatList(chat)
    void updateChat(chat)
  }

  const onSheetChatItemDeleteClick = (event: React.MouseEvent<HTMLButtonElement>, chat: ChatEntity): void => {
    event.stopPropagation()
    removeChatListEntry(chat.id!)
    void deleteChat(chat.id!)
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

  const onSheetChatItemEditConformClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    setShowChatItemEditConform(false)
    setChatItemEditId(undefined)
  }

  const onSheetChatItemEditClick = (event: React.MouseEvent<HTMLButtonElement>, chat: ChatEntity): void => {
    event.stopPropagation()
    setShowChatItemEditConform(true)
    if (chatItemEditId) {
      setChatItemEditId(undefined)
    } else {
      setChatItemEditId(chat.id)
    }
  }

  const searchControl = <ChatSearch layout={searchContainer ? 'actions' : 'overlay'} className={searchContainer ? 'contents' : 'h-9 bg-white dark:bg-(--app-canvas)'} open={searchOpen} value={searchQuery} onChange={setSearchQuery} onOpen={openSearch} onClose={closeSearch} />
  const search = searchContainer ? createPortal(searchControl, searchContainer) : searchContainer === undefined ? searchControl : null

  if (sortedChatList.filter(item => item.id !== -1).length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        {search}
        <div className="text-center text-gray-400 dark:text-(--app-text-muted)">
          <p className="text-sm">No chats yet</p>
          <p className="mt-1 text-xs">Start a new conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative pb-4">
      {search}

      {searchError ? (
        <div className={cn('px-4 pb-10 text-center', listTopPaddingClass)}>
          <p className="text-sm text-rose-500 dark:text-rose-400">Search failed</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-(--app-text-muted)">{searchError}</p>
        </div>
      ) : searchLoading ? (
        <div className={cn('px-4 pb-10 text-center', listTopPaddingClass)}>
          <p className="text-sm text-gray-500 dark:text-(--app-text-secondary)">Searching chats...</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-(--app-text-muted)">Scanning titles and messages</p>
        </div>
      ) : isSearchMode ? (
        displayResults.length === 0 ? (
          <div className={cn('px-4 pb-10 text-center', listTopPaddingClass)}>
            <p className="text-sm text-gray-500 dark:text-(--app-text-secondary)">No matching chats</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-(--app-text-muted)">Try another title or message keyword</p>
          </div>
        ) : (
          <div className={cn('space-y-0.5 px-1', listTopPaddingClass)}>
            {displayResults.map(result => {
              const item = result.chat
              const isActive = item.id === chatId
              const hitCount = getSearchResultHitCount(result)
              const telegramMeta = getTelegramBadgeMeta(item)

              return (
                <div
                  key={`${item.id}-${result.matchedMessageId ?? 'title'}`}
                  data-chat-title-row
                  id="chat-item"
                  onClick={event => onChatClick(event, result)}
                  className={cn(
                    'group relative flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 [content-visibility:auto] [contain-intrinsic-size:auto_88px]',
                    'transition-all duration-200 ease-out',
                    isActive
                      ? "bg-linear-to-r from-blue-50/80 via-blue-50/30 to-transparent after:absolute after:bottom-0.5 after:left-3 after:h-0.5 after:w-48 after:rounded-full after:bg-linear-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:content-[''] hover:from-blue-50/90 hover:via-blue-50/40 dark:bg-(--app-surface-hover) dark:bg-none dark:after:bg-(--app-accent) dark:after:opacity-70"
                      : 'hover:scale-[1.01] hover:bg-gray-100 hover:shadow-xs dark:hover:bg-(--app-surface-hover) dark:hover:shadow-none'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <span
                          className={cn(
                            'line-clamp-1 text-[13px] font-medium text-gray-700 transition-colors duration-200 dark:text-(--app-text-body) group-hover:text-gray-900 dark:group-hover:text-(--app-text-primary)'
                          )}
                        >
                          {renderHighlightedTitle(item.title, searchQuery)}
                        </span>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-(--app-surface-inset) dark:text-(--app-text-muted)">
                          {formatHitCountLabel(hitCount)}
                        </span>
                      </div>
                      <span className="shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-gray-400 dark:text-(--app-text-muted)">
                        {formatSearchResultDateTime(getSearchResultTimestamp(result))}
                      </span>
                    </div>
                    {telegramMeta && (
                      <div className="mt-1 flex min-w-0">
                        <TelegramChatBadge meta={telegramMeta} compact />
                      </div>
                    )}
                    {result.snippet && (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-(--app-text-secondary)">
                        {renderHighlightedSnippet(result.snippet, searchQuery)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : groupedChatList.length === 0 ? (
        <div className={cn('px-4 pb-10 text-center', listTopPaddingClass)}>
          <p className="text-sm text-gray-500 dark:text-(--app-text-secondary)">No matching chats</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-(--app-text-muted)">Try another title keyword</p>
        </div>
      ) : (
        groupedChatList.map(({ key, label, path, items }, index) => (
          <section
            key={key}
            className={cn('mb-1 border-0', index === 0 && listTopPaddingClass)}
          >
            <div className="group/header relative sticky top-0 z-20 border-0 bg-white px-1 dark:bg-(--app-canvas)">
              <button
                type="button"
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-md px-2 pr-9 text-[13px] font-medium hover:bg-(--app-surface-hover) hover:text-(--app-text-primary) focus-visible:outline focus-visible:outline-(--app-accent)',
                  collapsedGroups.has(key)
                    ? 'text-(--app-text-secondary)'
                    : 'bg-slate-50 text-slate-800 dark:bg-(--app-surface-hover) dark:text-(--app-text-primary)'
                )}
                title={path || 'Recently'}
                aria-expanded={!collapsedGroups.has(key)}
                onClick={() => {
                  if (!collapsedGroups.has(key)) {
                    setVisibleGroupCounts(counts => ({ ...counts, [key]: 5 }))
                  }
                  toggleChatGroup(key)
                }}
              >
                {!path ? <History className="h-3.5 w-3.5 shrink-0" /> : collapsedGroups.has(key)
                  ? <Folder className="h-3.5 w-3.5 shrink-0" />
                  : <FolderOpen className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate text-left">{label}</span>
              </button>
              {onNewWorkspaceChat && (
                <button
                  type="button"
                  aria-label={`New chat in ${label}`}
                  title="New chat"
                  onClick={() => onNewWorkspaceChat(path)}
                  className="group/new-chat app-undragable absolute right-2 top-1 flex h-7 w-7 items-center justify-center rounded-md text-(--app-text-secondary) opacity-0 group-hover/header:opacity-100 group-focus-within/header:opacity-100 hover:bg-(--app-surface-hover) hover:text-(--app-text-primary) focus-visible:outline focus-visible:outline-(--app-accent)"
                >
                  <BadgePlus className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover/new-chat:scale-110 group-hover/new-chat:rotate-90 motion-reduce:transition-none motion-reduce:transform-none" />
                </button>
              )}
            </div>

            <div hidden={collapsedGroups.has(key)} className="space-y-0.5 pl-5 pr-1 pt-1">
              {items.slice(0, visibleGroupCounts[key] ?? 5).map(result => {
                const item = result.chat
                const isActive = item.id === chatId
                const telegramMeta = getTelegramBadgeMeta(item)

                return (
                  <div
                    key={item.id}
                    data-chat-title-row
                    id="chat-item"
                    onClick={event => onChatClick(event, result)}
                    className={cn(
                      'group relative flex cursor-pointer min-h-10 items-center gap-3 rounded-lg px-3 py-1.5 [content-visibility:auto] [contain-intrinsic-size:auto_44px]',
                      'transition-colors duration-150 ease-out',
                      isActive
                        ? "bg-linear-to-r from-blue-50/80 via-blue-50/30 to-transparent after:absolute after:bottom-0.5 after:left-3 after:h-0.5 after:w-48 after:rounded-full after:bg-linear-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:content-[''] hover:from-blue-50/90 hover:via-blue-50/40 dark:bg-(--app-surface-hover) dark:bg-none dark:after:bg-(--app-accent) dark:after:opacity-70"
                        : 'hover:bg-gray-100 dark:hover:bg-(--app-surface-hover)'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      {showChatItemEditConform && chatItemEditId === item.id ? (
                        <Input
                          className="h-7 border-0 bg-transparent px-0 text-[13px] font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
                          onClick={e => e.stopPropagation()}
                          onChange={e => onChatItemTitleChange(e, item)}
                          value={item.title}
                          autoFocus
                        />
                      ) : (
                        <span
                          className={cn(
                            'line-clamp-1 text-[13px] font-medium text-gray-700 transition-colors duration-200 dark:text-(--app-text-body) group-hover:text-gray-900 dark:group-hover:text-(--app-text-primary)'
                          )}
                        >
                          {item.title}
                        </span>
                      )}
                      {telegramMeta && !(showChatItemEditConform && chatItemEditId === item.id) && (
                        <div className="mt-1 flex min-w-0">
                          <TelegramChatBadge meta={telegramMeta} />
                        </div>
                      )}
                    </div>

                    <div className="relative flex h-6 w-13 shrink-0 items-center">
                      <span
                        className={cn(
                          'absolute right-0 top-1/2 flex h-5.5 min-w-8 -translate-y-1/2 items-center justify-center px-1.5 text-[11px] font-normal tabular-nums text-(--app-text-muted) group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0'
                        )}
                      >
                        {item.msgCount ?? 0}
                      </span>

                      <div
                        className={cn(
                          'absolute inset-0 flex items-center justify-end gap-1 pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
                        )}
                      >
                        {showChatItemEditConform && chatItemEditId === item.id ? (
                          <button
                            onClick={onSheetChatItemEditConformClick}
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-(--app-surface-hover) focus-visible:outline focus-visible:outline-(--app-accent)'
                            )}
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={e => onSheetChatItemEditClick(e, item)}
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-(--app-text-secondary) dark:hover:bg-(--app-surface-hover) focus-visible:outline focus-visible:outline-(--app-accent)'
                            )}
                          >
                            <Pencil2Icon className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={e => onSheetChatItemDeleteClick(e, item)}
                          className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-(--app-surface-hover) focus-visible:outline focus-visible:outline-(--app-accent)'
                          )}
                        >
                          <Cross2Icon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {items.length > (visibleGroupCounts[key] ?? 5) && (
                <button
                  type="button"
                  onClick={() => setVisibleGroupCounts(counts => ({ ...counts, [key]: (counts[key] ?? 5) + 10 }))}
                  className="rounded-md px-3 py-1.5 text-[11px] text-(--app-text-secondary) hover:bg-(--app-surface-hover) hover:text-(--app-text-primary) focus-visible:outline focus-visible:outline-(--app-accent)"
                >
                  Show more
                </button>
              )}
            </div>
          </section>
        ))
      )}

    </div>
  )
}

export default React.memo(ChatTitleList)
