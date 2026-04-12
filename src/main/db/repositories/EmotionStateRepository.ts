import type { EmotionStateDao } from '@main/db/dao/EmotionStateDao'

type EmotionStateRepositoryDeps = {
  hasDb: () => boolean
  getEmotionStateRepo: () => EmotionStateDao | undefined
}

export class EmotionStateRepository {
  constructor(private readonly deps: EmotionStateRepositoryDeps) {}

  getEmotionStateByChatId(chatId: number): EmotionStateSnapshot | undefined {
    const repo = this.requireRepo()
    const row = repo.getByChatId(chatId)
    return row ? this.parseState(row.state_json) : undefined
  }

  getEmotionStateByChatUuid(chatUuid: string): EmotionStateSnapshot | undefined {
    const repo = this.requireRepo()
    const row = repo.getByChatUuid(chatUuid)
    return row ? this.parseState(row.state_json) : undefined
  }

  upsertEmotionState(chatId: number, chatUuid: string, state: EmotionStateSnapshot): void {
    const repo = this.requireRepo()
    const now = Date.now()
    const existing = repo.getByChatId(chatId)

    repo.upsert({
      chat_id: chatId,
      chat_uuid: chatUuid,
      state_json: JSON.stringify(state),
      created_at: existing?.created_at ?? now,
      updated_at: now
    })
  }

  deleteEmotionState(chatId: number): void {
    const repo = this.requireRepo()
    repo.deleteByChatId(chatId)
  }

  private parseState(value: string): EmotionStateSnapshot | undefined {
    try {
      return JSON.parse(value) as EmotionStateSnapshot
    } catch {
      return undefined
    }
  }

  private requireRepo(): EmotionStateDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getEmotionStateRepo()
    if (!repo) throw new Error('Emotion state repository not initialized')
    return repo
  }
}
