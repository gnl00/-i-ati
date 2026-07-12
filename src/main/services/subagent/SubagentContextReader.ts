import activityJournalService from '@main/services/activityJournal/ActivityJournalService'
import { workContextService } from '@main/services/workContext/WorkContextService'

export type SubagentJournalEntry = {
  title: string
  details?: string
}

export interface SubagentContextReader {
  getWorkContext(chatUuid: string): string | undefined
  listRecentActivity(chatUuid: string, limit: number): Promise<SubagentJournalEntry[]>
}

export class DefaultSubagentContextReader implements SubagentContextReader {
  getWorkContext(chatUuid: string): string | undefined {
    return workContextService.getSnapshot(chatUuid).content
  }

  async listRecentActivity(chatUuid: string, limit: number): Promise<SubagentJournalEntry[]> {
    try {
      return await activityJournalService.listEntries({
        dateKey: activityJournalService.getDateKey(),
        chatUuid,
        limit
      })
    } catch {
      return []
    }
  }
}
