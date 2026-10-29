import { awakeSnapshotService, type AwakeSnapshotService } from '@main/services/awake/AwakeSnapshotService'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

export class AwakeContextProvider {
  constructor(
    private readonly snapshotService: AwakeSnapshotService = awakeSnapshotService
  ) {}

  async build(input: {
    signal?: AbortSignal
    emotionEnabled?: boolean
    chat: ChatEntity
    workspacePath?: string
    currentQuery?: string
    compressionSummary?: CompressedSummaryEntity | null
  }): Promise<ChatMessage | null> {
    const snapshot = await this.snapshotService.build({
      emotionEnabled: input.emotionEnabled,
      signal: input.signal,
      chat: input.chat,
      workspacePath: input.workspacePath,
      currentQuery: input.currentQuery,
      compressionSummary: input.compressionSummary
    })

    return {
      role: 'user',
      source: MESSAGE_SOURCE.AWAKE_CONTEXT,
      content: [
        '<awake_state>',
        JSON.stringify(snapshot),
        '</awake_state>'
      ].join('\n'),
      segments: []
    }
  }
}
