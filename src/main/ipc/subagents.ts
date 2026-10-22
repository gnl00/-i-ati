import { ipcMain } from 'electron'
import subagentRunService from '@main/services/subagent/subagent-run-service'
import { SUBAGENT_SNAPSHOT_CHANNEL } from '@shared/subagent/events'
import type { SubagentRecord } from '@tools/subagent/index.d'

export function registerSubagentHandlers(): void {
  ipcMain.handle(SUBAGENT_SNAPSHOT_CHANNEL, (_event, args: unknown): SubagentRecord[] => {
    const chatUuid = args && typeof args === 'object' && 'chatUuid' in args ? args.chatUuid : undefined
    if (typeof chatUuid !== 'string' || !chatUuid.trim() || chatUuid.length > 256) throw new Error('Invalid subagent snapshot chat identity.')
    return subagentRunService.list(chatUuid)
  })
}
