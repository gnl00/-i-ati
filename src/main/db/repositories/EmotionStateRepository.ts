import type { EmotionStateDao } from '@main/db/dao/EmotionStateDao'
import { toEmotionStateEntity, toEmotionStateRow } from '@main/db/mappers/EmotionStateMapper'

type EmotionStateRepositoryDeps = {
  hasDb: () => boolean
  getEmotionStateRepo: () => EmotionStateDao | undefined
}

export class EmotionStateRepository {
  constructor(private readonly deps: EmotionStateRepositoryDeps) {}

  getEmotionStateByChatId(chatId: number): EmotionStateSnapshot | undefined {
    const repo = this.requireRepo()
    const row = repo.getByChatId(chatId)
    return row ? toEmotionStateEntity(row) : undefined
  }

  getEmotionStateByChatUuid(chatUuid: string): EmotionStateSnapshot | undefined {
    const repo = this.requireRepo()
    const row = repo.getByChatUuid(chatUuid)
    return row ? toEmotionStateEntity(row) : undefined
  }

  upsertEmotionState(chatId: number, chatUuid: string, state: EmotionStateSnapshot): void {
    const repo = this.requireRepo()
    const now = Date.now()
    const existing = repo.getByChatId(chatId)

    repo.upsert(toEmotionStateRow(chatId, chatUuid, state, now, {
      created_at: existing?.created_at ?? now,
      updated_at: now
    }))
  }

  deleteEmotionState(chatId: number): void {
    const repo = this.requireRepo()
    repo.deleteByChatId(chatId)
  }
  private requireRepo(): EmotionStateDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getEmotionStateRepo()
    if (!repo) throw new Error('Emotion state repository not initialized')
    return repo
  }
}
