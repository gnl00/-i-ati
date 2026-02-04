import type { MessageRepository } from '@main/db/repositories/MessageRepository'

type MessageDataServiceDeps = {
  hasDb: () => boolean
  getMessageRepo: () => MessageRepository | undefined
}

export class MessageDataService {
  constructor(private readonly deps: MessageDataServiceDeps) {}

  saveMessage(data: MessageEntity): number {
    const messageRepo = this.requireMessageRepo()
    const row = {
      chat_id: data.chatId ?? null,
      chat_uuid: data.chatUuid ?? null,
      body: JSON.stringify(data.body),
      tokens: data.tokens ?? null
    }
    return messageRepo.insertMessage(row)
  }

  getAllMessages(): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getAllMessages()
    return rows.map(row => this.mapMessageRow(row))
  }

  getMessageById(id: number): MessageEntity | undefined {
    const messageRepo = this.requireMessageRepo()
    const row = messageRepo.getMessageById(id)
    return row ? this.mapMessageRow(row) : undefined
  }

  getMessagesByChatId(chatId: number): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getMessagesByChatId(chatId)
    return rows.map(row => this.mapMessageRow(row))
  }

  getMessagesByChatUuid(chatUuid: string): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getMessagesByChatUuid(chatUuid)
    return rows.map(row => this.mapMessageRow(row))
  }

  getMessageByIds(ids: number[]): MessageEntity[] {
    const messageRepo = this.requireMessageRepo()
    const rows = messageRepo.getMessageByIds(ids)
    return rows.map(row => this.mapMessageRow(row))
  }

  updateMessage(data: MessageEntity): void {
    const messageRepo = this.requireMessageRepo()
    if (!data.id) return
    messageRepo.updateMessage({
      id: data.id,
      chat_id: data.chatId ?? null,
      chat_uuid: data.chatUuid ?? null,
      body: JSON.stringify(data.body),
      tokens: data.tokens ?? null
    })
  }

  deleteMessage(id: number): void {
    const messageRepo = this.requireMessageRepo()
    messageRepo.deleteMessage(id)
  }

  private mapMessageRow(row: {
    id: number
    chat_id: number | null
    chat_uuid: string | null
    body: string
    tokens: number | null
  }): MessageEntity {
    return {
      id: row.id,
      chatId: row.chat_id ?? undefined,
      chatUuid: row.chat_uuid ?? undefined,
      body: JSON.parse(row.body),
      tokens: row.tokens ?? undefined
    }
  }

  private requireMessageRepo(): MessageRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getMessageRepo()
    if (!repo) throw new Error('Message repository not initialized')
    return repo
  }
}
