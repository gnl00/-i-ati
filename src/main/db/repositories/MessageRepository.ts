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

type MessageRepositoryDeps = {
  hasDb: () => boolean
  getChatRepo: () => ChatDao | undefined
  getMessageRepo: () => MessageDao | undefined
}

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

  const lowercaseText = compactText.toLowerCase()
  const matchIndex = lowercaseText.indexOf(normalizedQuery)
  if (matchIndex < 0) {
    return compactText.slice(0, 96)
  }

  const start = Math.max(0, matchIndex - 42)
  const end = Math.min(compactText.length, matchIndex + normalizedQuery.length + 54)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < compactText.length ? '...' : ''

  return `${prefix}${compactText.slice(start, end)}${suffix}`
}

function buildResultScore(chat: ChatEntity, titleMatch: boolean, messageHitCount: number): number {
  let score = messageHitCount * 10

  if (titleMatch) {
    score += 1000
  }

  score += Math.min(chat.msgCount ?? 0, 20)

  return score
}
