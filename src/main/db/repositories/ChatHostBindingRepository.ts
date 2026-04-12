import type { ChatHostBindingDao } from '@main/db/dao/ChatHostBindingDao'
import {
  toChatHostBindingEntity,
  toChatHostBindingRow
} from '@main/db/mappers/ChatHostBindingMapper'

type ChatHostBindingRepositoryDeps = {
  hasDb: () => boolean
  getChatHostBindingRepo: () => ChatHostBindingDao | undefined
}

export class ChatHostBindingRepository {
  constructor(private readonly deps: ChatHostBindingRepositoryDeps) {}

  saveBinding(data: ChatHostBindingEntity): number {
    const repo = this.requireRepo()
    const now = Date.now()
    const row = toChatHostBindingRow(data, now)
    return repo.insertBinding(row)
  }

  upsertBinding(data: ChatHostBindingEntity): void {
    const repo = this.requireRepo()
    const now = Date.now()
    const row = toChatHostBindingRow(data, now)

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
    return row ? toChatHostBindingEntity(row) : undefined
  }

  getBindingsByChatUuid(chatUuid: string): ChatHostBindingEntity[] {
    const repo = this.requireRepo()
    return repo.getBindingsByChatUuid(chatUuid)
      .map(row => toChatHostBindingEntity(row))
      .filter((row): row is ChatHostBindingEntity => row !== undefined)
  }

  updateLastHostMessageId(id: number, lastHostMessageId?: string): void {
    const repo = this.requireRepo()
    repo.updateLastHostMessageId(id, lastHostMessageId ?? null, Date.now())
  }

  updateStatus(id: number, status: 'active' | 'archived'): void {
    const repo = this.requireRepo()
    repo.updateStatus(id, status, Date.now())
  }

  private requireRepo(): ChatHostBindingDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getChatHostBindingRepo()
    if (!repo) throw new Error('Chat host binding repository not initialized')
    return repo
  }
}
