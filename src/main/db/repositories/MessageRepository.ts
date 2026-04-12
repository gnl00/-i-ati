import type { ChatDao } from '@main/db/dao/ChatDao'
import type { MessageDao } from '@main/db/dao/MessageDao'
import {
  patchMessageRowUiState,
  toMessageEntity,
  toMessageInsertRow,
  toMessageRow
} from '@main/db/mappers/MessageMapper'

type MessageRepositoryDeps = {
  hasDb: () => boolean
  getChatRepo: () => ChatDao | undefined
  getMessageRepo: () => MessageDao | undefined
}

export class MessageRepository {
  constructor(private readonly deps: MessageRepositoryDeps) {}

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
