import type { WorkContextDao } from '@main/db/dao/WorkContextDao'

type WorkContextRepositoryDeps = {
  hasDb: () => boolean
  getWorkContextRepo: () => WorkContextDao | undefined
}

export class WorkContextRepository {
  constructor(private readonly deps: WorkContextRepositoryDeps) {}

  getWorkContextByChatId(chatId: number): WorkContextRecord | undefined {
    const repo = this.requireRepo()
    const row = repo.getByChatId(chatId)
    return row
      ? {
          chatId: row.chat_id,
          chatUuid: row.chat_uuid,
          content: row.content,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      : undefined
  }

  getWorkContextByChatUuid(chatUuid: string): WorkContextRecord | undefined {
    const repo = this.requireRepo()
    const row = repo.getByChatUuid(chatUuid)
    return row
      ? {
          chatId: row.chat_id,
          chatUuid: row.chat_uuid,
          content: row.content,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      : undefined
  }

  upsertWorkContext(chatId: number, chatUuid: string, content: string): WorkContextRecord {
    const repo = this.requireRepo()
    const now = Date.now()
    const existing = repo.getByChatId(chatId)

    repo.upsert({
      chat_id: chatId,
      chat_uuid: chatUuid,
      content,
      created_at: existing?.created_at ?? now,
      updated_at: now
    })

    return {
      chatId,
      chatUuid,
      content,
      createdAt: existing?.created_at ?? now,
      updatedAt: now
    }
  }

  deleteWorkContext(chatId: number): void {
    const repo = this.requireRepo()
    repo.deleteByChatId(chatId)
  }

  private requireRepo(): WorkContextDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getWorkContextRepo()
    if (!repo) throw new Error('Work context repository not initialized')
    return repo
  }
}

export interface WorkContextRecord {
  chatId: number
  chatUuid: string
  content: string
  createdAt: number
  updatedAt: number
}
