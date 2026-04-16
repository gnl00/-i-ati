import { describe, expect, it } from 'vitest'
import { buildAssistantMessageShellState } from '../model/assistantMessageShellState'

describe('buildAssistantMessageShellState', () => {
  it('keeps shell visible for hidden emotion-only transcript under current shell semantics', () => {
    const shellState = buildAssistantMessageShellState({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          {
            type: 'toolCall',
            segmentId: 'emotion-tool',
            name: 'emotion_report',
            toolCallId: 'emotion-tool',
            toolCallIndex: 0,
            isError: false,
            timestamp: 1,
            content: {
              toolName: 'emotion_report',
              status: 'completed'
            },
            presentation: {
              transcriptVisible: false
            }
          }
        ]
      },
      isLatest: true,
      isResponseActive: false,
      isCommandConfirmPending: false
    })

    expect(shellState.shouldRender).toBe(true)
  })

  it('keeps shell visible for latest active response even without visible transcript yet', () => {
    const shellState = buildAssistantMessageShellState({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: []
      },
      isLatest: true,
      isResponseActive: true,
      isCommandConfirmPending: false
    })

    expect(shellState.shouldRender).toBe(true)
  })
})
