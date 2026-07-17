import type { EmotionStateDao } from '@main/db/dao/EmotionStateDao'
import {
  parseEmotionStateRow,
  toEmotionStateRow
} from '@main/db/mappers/EmotionStateMapper'
import { createLogger } from '@main/logging/LogService'

type EmotionStateRepositoryDeps = {
  hasDb: () => boolean
  getEmotionStateRepo: () => EmotionStateDao | undefined
}

export class EmotionStateRepository {
  private readonly logger = createLogger('EmotionStateRepository')

  constructor(private readonly deps: EmotionStateRepositoryDeps) {}

  getEmotionState(): EmotionStateSnapshot | undefined {
    const repo = this.requireRepo()
    const row = repo.get()
    return row ? this.materialize(row) : undefined
  }

  upsertEmotionState(state: EmotionStateSnapshot): void {
    const repo = this.requireRepo()
    const now = Date.now()
    const existing = repo.get()

    repo.upsert(toEmotionStateRow(state, now, {
      created_at: existing?.created_at ?? now,
      updated_at: now
    }))
  }

  transitionEmotionState<T extends {
    state: EmotionStateSnapshot
    changed: boolean
  }>(
    transition: (previous: EmotionStateSnapshot | undefined) => T
  ): T {
    const repo = this.requireRepo()
    return repo.transaction(() => {
      const existing = repo.get()
      const previous = existing ? this.materialize(existing) : undefined
      const result = transition(previous)

      if (result.changed) {
        const now = Date.now()
        repo.upsert(toEmotionStateRow(result.state, now, {
          created_at: existing?.created_at ?? now,
          updated_at: now
        }))
      }

      return result
    })
  }

  clearEmotionState(): void {
    const repo = this.requireRepo()
    repo.delete()
  }

  private materialize(row: import('@main/db/dao/EmotionStateDao').EmotionStateRow): EmotionStateSnapshot {
    const parsed = parseEmotionStateRow(row)
    if (parsed.status !== 'current') {
      this.logger.warn('emotion_state.normalized', {
        scope: row.scope,
        status: parsed.status,
        issues: parsed.issues
      })
    }
    return parsed.state
  }

  private requireRepo(): EmotionStateDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getEmotionStateRepo()
    if (!repo) throw new Error('Emotion state repository not initialized')
    return repo
  }
}
