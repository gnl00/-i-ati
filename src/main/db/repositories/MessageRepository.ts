import type { ChatDao } from '@main/db/dao/ChatDao'
import type { MessageDao } from '@main/db/dao/MessageDao'
import { toChatEntity } from '@main/db/mappers/ChatMapper'
import {
  patchMessageRowUiState,
  toMessageEntity,
  toMessageInsertRow,
  toMessageRow
} from '@main/db/mappers/MessageMapper'
import { extractSearchableMessageText } from '@main/services/messages/MessageSegmentContent'
import type { HistorySearchArgs, HistorySearchItem, HistorySearchMessage } from '@tools/history/index.d'

type MessageRepositoryDeps = {
  hasDb: () => boolean
  getChatRepo: () => ChatDao | undefined
  getMessageRepo: () => MessageDao | undefined
}

type SearchableMessageRecord = {
  id: number
  chatKey: string
  chatUuid?: string
  chatId?: number
  role: 'user' | 'assistant'
  text: string
  normalizedText: string
  createdAt: number
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const HISTORY_MESSAGE_WINDOW_LIMIT = 2
const HISTORY_SNIPPET_LIMIT = 180
const HISTORY_MESSAGE_TEXT_LIMIT = 320

export class MessageRepository {
  constructor(private readonly deps: MessageRepositoryDeps) {}

  searchChats(args: ChatSearchRequest): ChatSearchResult[] {
    const normalizedQuery = normalizeSearchText(args.query)
    if (!normalizedQuery) {
      return []
    }

    const limit = normalizeLimit(args.limit)
    const chatRepo = this.requireChatRepo()
    const messageRepo = this.requireMessageRepo()
    const chats = chatRepo.getAllChats().map(toChatEntity)
    const messageMatchesByChatKey = new Map<string, {
      matchedMessageId?: number
      matchedTimestamp?: number
      snippet?: string
      messageHitCount: number
    }>()

    for (const row of messageRepo.getAllMessages()) {
      const chatKey = resolveMessageChatKey(row.chat_uuid, row.chat_id)
      if (!chatKey || !row.body) {
        continue
      }

      let body: ChatMessage
      try {
        body = JSON.parse(row.body) as ChatMessage
      } catch {
        continue
      }

      if (body.role !== 'user' && body.role !== 'assistant') {
        continue
      }

      const searchableText = extractSearchableMessageText(body)
      const normalizedText = normalizeSearchText(searchableText)
      if (!normalizedText.includes(normalizedQuery)) {
        continue
      }

      const current = messageMatchesByChatKey.get(chatKey) ?? {
        matchedMessageId: undefined,
        matchedTimestamp: undefined,
        snippet: undefined,
        messageHitCount: 0
      }
      current.messageHitCount += countOccurrences(normalizedText, normalizedQuery)
      if (current.matchedMessageId === undefined) {
        current.matchedMessageId = row.id
        current.matchedTimestamp = typeof body.createdAt === 'number' ? body.createdAt : undefined
        current.snippet = buildSnippet(searchableText, normalizedQuery)
      }
      messageMatchesByChatKey.set(chatKey, current)
    }

    const results = chats
      .map((chat): ChatSearchResult | null => {
        const chatKey = resolveChatKey(chat)
        if (!chatKey) {
          return null
        }

        const titleMatch = normalizeSearchText(chat.title).includes(normalizedQuery)
        const messageMatch = messageMatchesByChatKey.get(chatKey)

        if (!titleMatch && !messageMatch) {
          return null
        }

        const matchSource: ChatSearchResult['matchSource'] = titleMatch
          ? (messageMatch ? 'title+message' : 'title')
          : 'message'

        return {
          chat,
          matchSource,
          matchedMessageId: messageMatch?.matchedMessageId,
          matchedTimestamp: messageMatch?.matchedTimestamp,
          snippet: messageMatch?.snippet,
          messageHitCount: messageMatch?.messageHitCount ?? 0,
          score: buildResultScore(chat, titleMatch, messageMatch?.messageHitCount ?? 0)
        }
      })
      .filter((result): result is ChatSearchResult => result !== null)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        return b.chat.updateTime - a.chat.updateTime
      })

    return limit ? results.slice(0, limit) : results
  }

  searchHistory(args: HistorySearchArgs): HistorySearchItem[] {
    const limit = normalizeLimit(args.limit) ?? 5
    const normalizedQuery = normalizeSearchText(args.query)
    const withinDays = normalizeWithinDays(args.withinDays)
    const scopeChatKey = args.scope === 'current_chat'
      ? resolveMessageChatKey(args.chat_uuid ?? null, null)
      : undefined
    const minCreatedAt = Date.now() - withinDays * DAY_IN_MS
    const chats = this.requireChatRepo()
      .getAllChats()
      .map(toChatEntity)
      .filter((chat) => {
        if (!scopeChatKey) {
          return true
        }

        return resolveChatKey(chat) === scopeChatKey
      })
    const chatByKey = new Map<string, ChatEntity>()

    chats.forEach((chat) => {
      const key = resolveChatKey(chat)
      if (key) {
        chatByKey.set(key, chat)
      }
    })

    const messagesByChatKey = new Map<string, SearchableMessageRecord[]>()
    const recentMessages: SearchableMessageRecord[] = []

    for (const row of this.requireMessageRepo().getAllMessages()) {
      const message = buildSearchableMessageRecord(row, chatByKey, minCreatedAt)
      if (!message) {
        continue
      }

      recentMessages.push(message)
      const bucket = messagesByChatKey.get(message.chatKey) ?? []
      bucket.push(message)
      messagesByChatKey.set(message.chatKey, bucket)
    }

    messagesByChatKey.forEach((bucket) => {
      bucket.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
    })

    if (!normalizedQuery) {
      return recentMessages
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
        .slice(0, limit)
        .map((message) => {
          const chat = chatByKey.get(message.chatKey)
          if (!chat?.uuid) {
            return null
          }

          return buildHistoryItem({
            chat,
            matchedMessageId: message.id,
            matchedFields: ['message'],
            hitCount: 1,
            createdAt: message.createdAt,
            snippet: buildPreviewSnippet(message.text),
            messages: buildHistoryMessageWindow(messagesByChatKey.get(message.chatKey), message.id)
          })
        })
        .filter((item): item is HistorySearchItem => item !== null)
    }

    const items: HistorySearchItem[] = []
    const chatsWithMessageMatches = new Set<string>()

    for (const message of recentMessages) {
      if (!message.normalizedText.includes(normalizedQuery)) {
        continue
      }

      const chat = chatByKey.get(message.chatKey)
      if (!chat?.uuid) {
        continue
      }

      chatsWithMessageMatches.add(message.chatKey)
      const titleHitCount = countOccurrences(normalizeSearchText(chat.title), normalizedQuery)
      const messageHitCount = countOccurrences(message.normalizedText, normalizedQuery)

      items.push(buildHistoryItem({
        chat,
        matchedMessageId: message.id,
        matchedFields: titleHitCount > 0 ? ['title', 'message'] : ['message'],
        hitCount: titleHitCount + messageHitCount,
        createdAt: message.createdAt,
        snippet: buildSnippet(message.text, normalizedQuery),
        messages: buildHistoryMessageWindow(messagesByChatKey.get(message.chatKey), message.id)
      }))
    }

    for (const chat of chats) {
      const chatKey = resolveChatKey(chat)
      if (!chatKey) {
        continue
      }

      const titleHitCount = countOccurrences(normalizeSearchText(chat.title), normalizedQuery)
      if (titleHitCount <= 0 || chatsWithMessageMatches.has(chatKey)) {
        continue
      }

      const recentBucket = messagesByChatKey.get(chatKey)
      const createdAt = recentBucket?.[recentBucket.length - 1]?.createdAt ?? chat.updateTime
      if (createdAt < minCreatedAt) {
        continue
      }

      items.push(buildHistoryItem({
        chat,
        matchedMessageId: recentBucket?.[recentBucket.length - 1]?.id,
        matchedFields: ['title'],
        hitCount: titleHitCount,
        createdAt,
        snippet: buildSnippet(chat.title, normalizedQuery),
        messages: buildHistoryMessageWindow(recentBucket)
      }))
    }

    return items
      .sort((a, b) => compareHistoryItems(a, b))
      .slice(0, limit)
  }

  saveMessage(data: MessageEntity): number {
    const messageRepo = this.requireMessageRepo()
    const row = toMessageInsertRow(data)
    const messageId = messageRepo.insertMessage(row)

    if (row.chat_id && this.shouldCountForChat(row.body)) {
      this.requireChatRepo().updateMessageCount(row.chat_id, 1)
    }

    return messageId
  }

  getAllMessages(): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getAllMessages()
    return rows.map(toMessageEntity)
  }

  getMessageById(id: number): MessageEntity | undefined {
    const messageRepo = this.requireMessageRepo()
    const row = messageRepo.getMessageById(id)
    return row ? toMessageEntity(row) : undefined
  }

  getMessagesByChatId(chatId: number): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getMessagesByChatId(chatId)
    return rows.map(toMessageEntity)
  }

  getMessagesByChatUuid(chatUuid: string): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getMessagesByChatUuid(chatUuid)
    return rows.map(toMessageEntity)
  }

  getMessageByIds(ids: number[]): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getMessageByIds(ids)
    return rows.map(toMessageEntity)
  }

  updateMessage(data: MessageEntity): void {
    const messageRepo = this.requireMessageRepo()
    if (!data.id) return

    const prev = messageRepo.getMessageById(data.id)
    const next = toMessageRow(data)
    messageRepo.updateMessage(next)

    if (!prev) {
      return
    }

    this.reconcileChatMessageCount(prev, next)
  }

  patchMessageUiState(id: number, uiState: { typewriterCompleted?: boolean }): void {
    const messageRepo = this.requireMessageRepo()
    const row = messageRepo.getMessageById(id)
    if (!row) {
      return
    }

    messageRepo.updateMessage(patchMessageRowUiState(row, uiState))
  }

  deleteMessage(id: number): void {
    const messageRepo = this.requireMessageRepo()
    const prev = messageRepo.getMessageById(id)
    messageRepo.deleteMessage(id)

    if (prev?.chat_id && this.shouldCountForChat(prev.body)) {
      this.requireChatRepo().updateMessageCount(prev.chat_id, -1)
    }
  }

  private reconcileChatMessageCount(
    prev: { chat_id: number | null; body: string },
    next: { chat_id: number | null; body: string }
  ): void {
    const prevCounted = this.shouldCountForChat(prev.body)
    const nextCounted = this.shouldCountForChat(next.body)
    const chatRepo = this.requireChatRepo()

    if (prev.chat_id === next.chat_id) {
      if (!next.chat_id || prevCounted === nextCounted) {
        return
      }

      chatRepo.updateMessageCount(next.chat_id, nextCounted ? 1 : -1)
      return
    }

    if (prev.chat_id && prevCounted) {
      chatRepo.updateMessageCount(prev.chat_id, -1)
    }

    if (next.chat_id && nextCounted) {
      chatRepo.updateMessageCount(next.chat_id, 1)
    }
  }

  private shouldCountForChat(bodyJson: string | null | undefined): boolean {
    if (!bodyJson) {
      return false
    }

    try {
      const parsed = JSON.parse(bodyJson) as { role?: 'system' | 'user' | 'assistant' | 'tool' }
      return parsed.role === 'user' || parsed.role === 'assistant'
    } catch {
      return false
    }
  }

  private requireChatRepo(): ChatDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getChatRepo()
    if (!repo) throw new Error('Chat repository not initialized')
    return repo
  }

  private requireMessageRepo(): MessageDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getMessageRepo()
    if (!repo) throw new Error('Message repository not initialized')
    return repo
  }
}

function normalizeSearchText(value: string | undefined | null): string {
  return (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function normalizeLimit(limit: number | undefined): number | undefined {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return undefined
  }

  return Math.floor(limit)
}

function normalizeWithinDays(withinDays: number | undefined): number {
  if (typeof withinDays !== 'number' || !Number.isFinite(withinDays) || withinDays <= 0) {
    return 3
  }

  return Math.min(Math.floor(withinDays), 7)
}

function resolveChatKey(chat: ChatEntity): string | undefined {
  if (chat.uuid) {
    return `uuid:${chat.uuid}`
  }

  if (chat.id) {
    return `id:${chat.id}`
  }

  return undefined
}

function resolveMessageChatKey(chatUuid: string | null, chatId: number | null): string | undefined {
  if (chatUuid) {
    return `uuid:${chatUuid}`
  }

  if (chatId) {
    return `id:${chatId}`
  }

  return undefined
}

function countOccurrences(text: string, query: string): number {
  let count = 0
  let searchFrom = 0

  while (searchFrom < text.length) {
    const index = text.indexOf(query, searchFrom)
    if (index < 0) {
      break
    }
    count += 1
    searchFrom = index + query.length
  }

  return count
}

function buildSnippet(text: string, normalizedQuery: string): string {
  const compactText = text.trim().replace(/\s+/g, ' ')
  if (!compactText) {
    return ''
  }

  if (!normalizedQuery) {
    return buildPreviewSnippet(compactText)
  }

  const lowercaseText = compactText.toLowerCase()
  const matchIndex = lowercaseText.indexOf(normalizedQuery)
  if (matchIndex < 0) {
    return compactText.slice(0, Math.min(compactText.length, HISTORY_SNIPPET_LIMIT))
  }

  const start = Math.max(0, matchIndex - 42)
  const end = Math.min(compactText.length, start + HISTORY_SNIPPET_LIMIT)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < compactText.length ? '...' : ''

  return `${prefix}${compactText.slice(start, end)}${suffix}`
}

function buildPreviewSnippet(text: string): string {
  const compactText = text.trim().replace(/\s+/g, ' ')
  if (!compactText) {
    return ''
  }

  if (compactText.length <= HISTORY_SNIPPET_LIMIT) {
    return compactText
  }

  return `${compactText.slice(0, HISTORY_SNIPPET_LIMIT - 3)}...`
}

function buildResultScore(chat: ChatEntity, titleMatch: boolean, messageHitCount: number): number {
  let score = messageHitCount * 10

  if (titleMatch) {
    score += 1000
  }

  score += Math.min(chat.msgCount ?? 0, 20)

  return score
}

function buildSearchableMessageRecord(
  row: { id: number; chat_id: number | null; chat_uuid: string | null; body: string | null },
  chatByKey: Map<string, ChatEntity>,
  minCreatedAt: number
): SearchableMessageRecord | null {
  const chatKey = resolveMessageChatKey(row.chat_uuid, row.chat_id)
  if (!chatKey || !row.body) {
    return null
  }

  const chat = chatByKey.get(chatKey)
  if (!chat) {
    return null
  }

  let body: ChatMessage
  try {
    body = JSON.parse(row.body) as ChatMessage
  } catch {
    return null
  }

  if (body.role !== 'user' && body.role !== 'assistant') {
    return null
  }

  const text = extractSearchableMessageText(body).trim()
  if (!text) {
    return null
  }

  const createdAt = typeof body.createdAt === 'number' ? body.createdAt : chat.updateTime
  if (createdAt < minCreatedAt) {
    return null
  }

  return {
    id: row.id,
    chatKey,
    chatUuid: row.chat_uuid ?? chat.uuid,
    chatId: row.chat_id ?? chat.id,
    role: body.role,
    text,
    normalizedText: normalizeSearchText(text),
    createdAt
  }
}

function buildHistoryItem(input: {
  chat: ChatEntity
  matchedMessageId?: number
  matchedFields: Array<'title' | 'message'>
  hitCount: number
  createdAt: number
  snippet: string
  messages: HistorySearchMessage[]
}): HistorySearchItem {
  return {
    chatUuid: input.chat.uuid,
    chatId: input.chat.id,
    chatTitle: input.chat.title,
    matchedMessageId: input.matchedMessageId,
    matchedFields: input.matchedFields,
    hitCount: input.hitCount,
    createdAt: input.createdAt,
    snippet: input.snippet,
    messages: input.messages
  }
}

function buildHistoryMessageWindow(
  entries: SearchableMessageRecord[] | undefined,
  matchedMessageId?: number
): HistorySearchMessage[] {
  if (!entries || entries.length === 0) {
    return []
  }

  if (matchedMessageId === undefined) {
    return entries
      .slice(-HISTORY_MESSAGE_WINDOW_LIMIT)
      .map(toHistorySearchMessage)
  }

  const index = entries.findIndex(entry => entry.id === matchedMessageId)
  if (index < 0) {
    return entries
      .slice(-HISTORY_MESSAGE_WINDOW_LIMIT)
      .map(toHistorySearchMessage)
  }

  const focus = entries[index]
  const previous = entries[index - 1]
  const next = entries[index + 1]
  const context = pickHistoryContextMessage(focus, previous, next)
  const selected = context
    ? [context, focus].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
    : [focus]

  return selected
    .slice(-HISTORY_MESSAGE_WINDOW_LIMIT)
    .map(toHistorySearchMessage)
}

function pickHistoryContextMessage(
  focus: SearchableMessageRecord,
  previous: SearchableMessageRecord | undefined,
  next: SearchableMessageRecord | undefined
): SearchableMessageRecord | undefined {
  if (focus.role === 'assistant' && previous?.role === 'user') {
    return previous
  }

  if (focus.role === 'user' && next?.role === 'assistant') {
    return next
  }

  return previous ?? next
}

function toHistorySearchMessage(message: SearchableMessageRecord): HistorySearchMessage {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    text: truncateText(message.text, HISTORY_MESSAGE_TEXT_LIMIT)
  }
}

function truncateText(text: string, maxLength: number): string {
  const compactText = text.trim().replace(/\s+/g, ' ')
  if (compactText.length <= maxLength) {
    return compactText
  }

  return `${compactText.slice(0, maxLength - 3)}...`
}

function compareHistoryItems(a: HistorySearchItem, b: HistorySearchItem): number {
  const aMessageMatch = a.matchedFields.includes('message') ? 1 : 0
  const bMessageMatch = b.matchedFields.includes('message') ? 1 : 0
  if (bMessageMatch !== aMessageMatch) {
    return bMessageMatch - aMessageMatch
  }

  const aTitleMatch = a.matchedFields.includes('title') ? 1 : 0
  const bTitleMatch = b.matchedFields.includes('title') ? 1 : 0
  if (bTitleMatch !== aTitleMatch) {
    return bTitleMatch - aTitleMatch
  }

  if (b.hitCount !== a.hitCount) {
    return b.hitCount - a.hitCount
  }

  return b.createdAt - a.createdAt
}
