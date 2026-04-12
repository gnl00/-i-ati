import type { MessageDao } from '@main/db/dao/MessageDao'
import {
  patchMessageRowUiState,
  toMessageEntity,
  toMessageInsertRow,
  toMessageRow
} from '@main/db/mappers/MessageMapper'

type MessageRepositoryDeps = {
  hasDb: () => boolean
  getMessageRepo: () => MessageDao | undefined
}

export class MessageRepository {
  constructor(private readonly deps: MessageRepositoryDeps) {}

  saveMessage(data: MessageEntity): number {
    const messageRepo = this.requireMessageRepo()
    return messageRepo.insertMessage(toMessageInsertRow(data))
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
    messageRepo.updateMessage(toMessageRow(data))
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
    messageRepo.deleteMessage(id)
  }

  private requireMessageRepo(): MessageDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getMessageRepo()
    if (!repo) throw new Error('Message repository not initialized')
    return repo
  }
}
