import type {
  SmartMessageCandidateSummaryRow,
  SmartMessageDao
} from '@main/db/dao/SmartMessageDao'
import {
  toSmartMessageEntity,
  toSmartMessageRow
} from '@main/db/mappers/SmartMessageMapper'

type SmartMessageRepositoryDeps = {
  hasDb: () => boolean
  getSmartMessageRepo: () => SmartMessageDao | undefined
}

export class SmartMessageRepository {
  constructor(private readonly deps: SmartMessageRepositoryDeps) {}

  upsertSmartMessage(message: SmartMessageEntity): void {
    this.requireSmartMessageRepo().upsert(toSmartMessageRow(message))
  }

  getActiveSmartMessages(now: number, limit: number): SmartMessageEntity[] {
    return this.requireSmartMessageRepo()
      .getActive(now, limit)
      .map(toSmartMessageEntity)
  }

  markSmartMessageStatus(id: string, status: SmartMessageStatus): void {
    this.requireSmartMessageRepo().markStatus(id, status)
  }

  markChatSmartMessagesStale(chatUuid: string): void {
    this.requireSmartMessageRepo().markChatMessagesStale(chatUuid)
  }

  getSmartMessageBySourceHash(
    sourceHash: string,
    generationVersion: number
  ): SmartMessageEntity | undefined {
    const row = this.requireSmartMessageRepo().getBySourceHash(sourceHash, generationVersion)
    return row ? toSmartMessageEntity(row) : undefined
  }

  listRecentCandidateSummaries(
    since: number,
    limit: number
  ): SmartMessageCandidateSummaryRow[] {
    return this.requireSmartMessageRepo().listRecentCandidateSummaries(since, limit)
  }

  private requireSmartMessageRepo(): SmartMessageDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getSmartMessageRepo()
    if (!repo) throw new Error('Smart message repository not initialized')
    return repo
  }
}
