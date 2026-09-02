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
    if (!row) {
      return undefined
    }

    const parsed = this.parse(row)
    this.persistMigration(repo, row, parsed)
    return parsed.state
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
      const parsed = existing ? this.parse(existing) : undefined
      if (existing && parsed) {
        this.persistMigration(repo, existing, parsed)
      }
      const previous = parsed?.state
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

  private parse(row: import('@main/db/dao/EmotionStateDao').EmotionStateRow) {
    const parsed = parseEmotionStateRow(row)
    if (parsed.status !== 'current') {
      this.logger.warn('emotion_state.normalized', {
        scope: row.scope,
        status: parsed.status,
        issues: parsed.issues
      })
    }
    return parsed
  }

  private persistMigration(
    repo: EmotionStateDao,
    row: import('@main/db/dao/EmotionStateDao').EmotionStateRow,
    parsed: ReturnType<typeof parseEmotionStateRow>
  ): void {
    if (parsed.status !== 'migrated') {
      return
    }

    repo.upsert(toEmotionStateRow(parsed.state, row.updated_at, {
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  }

  private requireRepo(): EmotionStateDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getEmotionStateRepo()
    if (!repo) throw new Error('Emotion state repository not initialized')
    return repo
  }
}
