import { awakeSnapshotService, type AwakeSnapshotService } from '@main/services/awake/AwakeSnapshotService'

export class AwakeContextProvider {
  constructor(
    private readonly snapshotService: AwakeSnapshotService = awakeSnapshotService
  ) {}

  async build(input: {
    chat: ChatEntity
    workspacePath?: string
    currentQuery?: string
    compressionSummary?: CompressedSummaryEntity | null
  }): Promise<ChatMessage | null> {
    const snapshot = await this.snapshotService.build({
      chat: input.chat,
      workspacePath: input.workspacePath,
      currentQuery: input.currentQuery,
      compressionSummary: input.compressionSummary
    })

    return {
      role: 'user',
      content: [
        '<awake_state>',
        JSON.stringify(snapshot, null, 2),
        '</awake_state>'
      ].join('\n'),
      segments: []
    }
  }
}
