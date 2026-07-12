import DatabaseService from './DatabaseService'
import type { SmartMessageCandidateSummaryRow } from './dao/SmartMessageDao'

export const smartMessageDb = {
  upsertSmartMessage: (message: SmartMessageEntity): void => DatabaseService.upsertSmartMessage(message),
  getActiveSmartMessages: (limit?: number): SmartMessageEntity[] => DatabaseService.getActiveSmartMessages(limit),
  dismissSmartMessage: (id: string): void => DatabaseService.dismissSmartMessage(id),
  markChatSmartMessagesStale: (chatUuid: string): void => DatabaseService.markChatSmartMessagesStale(chatUuid),
  getSmartMessageBySourceHash: (sourceHash: string, generationVersion: number): SmartMessageEntity | undefined =>
    DatabaseService.getSmartMessageBySourceHash(sourceHash, generationVersion),
  listRecentSmartMessageCandidateSummaries: (since: number, limit: number): SmartMessageCandidateSummaryRow[] =>
    DatabaseService.listRecentSmartMessageCandidateSummaries(since, limit)
}
