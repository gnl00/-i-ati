import { AppDatabase } from './core/Database'
import { SubagentRepository, type SubagentMessage, type StoredSubagentRun } from './repositories/SubagentRepository'
import type { SubagentRecord } from '@tools/subagent/index.d'

const repository = (): SubagentRepository => new SubagentRepository(AppDatabase.getInstance().getDb())
export const subagentDb = {
  save: (run: StoredSubagentRun): void => repository().save(run),
  get: (childId: string, runId?: string): StoredSubagentRun | null => repository().get(childId, runId),
  list: (chatUuid: string): SubagentRecord[] => repository().list(chatUuid),
  recoverInterrupted: (): void => repository().recoverInterrupted()
}

export const subagentMessageDb = {
  send: (input: Omit<SubagentMessage, 'status' | 'runId'>): SubagentMessage => repository().sendMessage(input),
  get: (id: string): SubagentMessage | null => repository().getMessage(id),
  pending: (childId: string): SubagentMessage[] => repository().pendingMessages(childId),
  deliver: (id: string, runId: string): void => repository().deliverMessage(id, runId),
  acknowledge: (id: string, runId: string): void => repository().acknowledgeMessage(id, runId),
  forRun: (runId: string): SubagentMessage[] => repository().messagesForRun(runId)
}
