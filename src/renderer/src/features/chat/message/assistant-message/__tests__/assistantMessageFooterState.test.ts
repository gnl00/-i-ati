import { describe, expect, it } from 'vitest'
import { buildAssistantMessageFooterState } from '../model/assistantMessageFooterState'

describe('buildAssistantMessageFooterState', () => {
  it('hides operations for overlay preview rows', () => {
    const state = buildAssistantMessageFooterState({
      committedMessage: {
        role: 'assistant',
        content: 'hello',
        segments: []
      },
      isLatest: true,
      isOverlayPreview: true
    })

    expect(state.showOperations).toBe(false)
    expect(state.showRegenerate).toBe(true)
    expect(state.showBranch).toBe(false)
  })

  it('shows branch for a persisted terminal assistant message', () => {
    const state = buildAssistantMessageFooterState({
      committedMessage: {
        role: 'assistant',
        content: 'hello',
        segments: [],
        typewriterCompleted: true
      },
      messageId: 42,
      isLatest: false,
      isOverlayPreview: false
    })

    expect(state.showBranch).toBe(true)
  })

  it('shows branch for completed tool-call messages and hides it during playback', () => {
    const incomplete = buildAssistantMessageFooterState({
      committedMessage: {
        role: 'assistant',
        content: 'typing',
        segments: [],
        typewriterCompleted: false
      },
      messageId: 42,
      isLatest: true,
      isOverlayPreview: false
    })
    const toolCall = buildAssistantMessageFooterState({
      committedMessage: {
        role: 'assistant',
        content: 'calling tool',
        segments: [],
        typewriterCompleted: true,
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'read_file', arguments: '{}' }
        }]
      },
      messageId: 43,
      isLatest: true,
      isOverlayPreview: false
    })

    expect(incomplete.showBranch).toBe(false)
    expect(toolCall.showBranch).toBe(true)
  })
})
