import type { SmartMessageCandidateSummaryRow } from '@main/db/dao/SmartMessageDao'
import type { SmartMessageRepository } from '../repositories/SmartMessageRepository'

type SmartMessageDbServiceDeps = {
  smartMessageRepository: () => SmartMessageRepository | undefined
}

export class SmartMessageDbService {
  constructor(private readonly deps: SmartMessageDbServiceDeps) {}

  upsertSmartMessage(message: SmartMessageEntity): void {
    this.requireSmartMessageRepository().upsertSmartMessage(message)
  }

  getActiveSmartMessages(limit: number = 3, now: number = Date.now()): SmartMessageEntity[] {
    return this.requireSmartMessageRepository().getActiveSmartMessages(now, limit)
  }

  dismissSmartMessage(id: string): void {
    this.requireSmartMessageRepository().markSmartMessageStatus(id, 'dismissed')
  }

  markChatSmartMessagesStale(chatUuid: string): void {
    this.requireSmartMessageRepository().markChatSmartMessagesStale(chatUuid)
  }

  getSmartMessageBySourceHash(sourceHash: string, generationVersion: number): SmartMessageEntity | undefined {
    return this.requireSmartMessageRepository().getSmartMessageBySourceHash(sourceHash, generationVersion)
  }

  listRecentSmartMessageCandidateSummaries(since: number, limit: number): SmartMessageCandidateSummaryRow[] {
    return this.requireSmartMessageRepository().listRecentCandidateSummaries(since, limit)
  }

  private requireSmartMessageRepository(): SmartMessageRepository {
    const repository = this.deps.smartMessageRepository()
    if (!repository) throw new Error('Smart message repository not initialized')
    return repository
  }
}
