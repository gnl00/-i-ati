import type { ChatHostBindingRepository, ChatHostBindingRow } from '@main/db/repositories/ChatHostBindingRepository'

type ChatHostBindingDataServiceDeps = {
  hasDb: () => boolean
  getChatHostBindingRepo: () => ChatHostBindingRepository | undefined
}

export class ChatHostBindingDataService {
  constructor(private readonly deps: ChatHostBindingDataServiceDeps) {}

  saveBinding(data: ChatHostBindingEntity): number {
    const repo = this.requireRepo()
    const now = Date.now()
    const row: ChatHostBindingRow = {
      id: data.id ?? 0,
      host_type: data.hostType,
      host_chat_id: data.hostChatId,
      host_thread_id: data.hostThreadId ?? null,
      host_user_id: data.hostUserId ?? null,
      chat_id: data.chatId,
      chat_uuid: data.chatUuid,
      last_host_message_id: data.lastHostMessageId ?? null,
      status: data.status,
      metadata_json: data.metadata ? JSON.stringify(data.metadata) : null,
      created_at: data.createTime ?? now,
      updated_at: data.updateTime ?? now
    }
    return repo.insertBinding(row)
  }

  upsertBinding(data: ChatHostBindingEntity): void {
    const repo = this.requireRepo()
    const now = Date.now()
    const row: ChatHostBindingRow = {
      id: data.id ?? 0,
      host_type: data.hostType,
      host_chat_id: data.hostChatId,
      host_thread_id: data.hostThreadId ?? null,
      host_user_id: data.hostUserId ?? null,
      chat_id: data.chatId,
      chat_uuid: data.chatUuid,
      last_host_message_id: data.lastHostMessageId ?? null,
      status: data.status,
      metadata_json: data.metadata ? JSON.stringify(data.metadata) : null,
      created_at: data.createTime ?? now,
      updated_at: data.updateTime ?? now
    }

    const existing = data.id
      ? undefined
      : repo.getBindingByHost(data.hostType, data.hostChatId, data.hostThreadId)

    if (data.id) {
      repo.updateBindingById(data.id, row)
      return
    }

    if (existing) {
      repo.updateBindingById(existing.id, row)
      return
    }

    repo.insertBinding(row)
  }

  getBindingByHost(
    hostType: string,
    hostChatId: string,
    hostThreadId?: string
  ): ChatHostBindingEntity | undefined {
    const repo = this.requireRepo()
    const row = repo.getBindingByHost(hostType, hostChatId, hostThreadId)
    return row ? this.mapRow(row) : undefined
  }

  getBindingsByChatUuid(chatUuid: string): ChatHostBindingEntity[] {
    const repo = this.requireRepo()
    return repo.getBindingsByChatUuid(chatUuid).map(row => this.mapRow(row))
  }

  updateLastHostMessageId(id: number, lastHostMessageId?: string): void {
    const repo = this.requireRepo()
    repo.updateLastHostMessageId(id, lastHostMessageId ?? null, Date.now())
  }

  updateStatus(id: number, status: 'active' | 'archived'): void {
    const repo = this.requireRepo()
    repo.updateStatus(id, status, Date.now())
  }

  private mapRow(row: ChatHostBindingRow): ChatHostBindingEntity {
    return {
      id: row.id,
      hostType: row.host_type,
      hostChatId: row.host_chat_id,
      hostThreadId: row.host_thread_id ?? undefined,
      hostUserId: row.host_user_id ?? undefined,
      chatId: row.chat_id,
      chatUuid: row.chat_uuid,
      lastHostMessageId: row.last_host_message_id ?? undefined,
      status: row.status,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined,
      createTime: row.created_at,
      updateTime: row.updated_at
    }
  }

  private requireRepo(): ChatHostBindingRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getChatHostBindingRepo()
    if (!repo) throw new Error('Chat host binding repository not initialized')
    return repo
  }
}
