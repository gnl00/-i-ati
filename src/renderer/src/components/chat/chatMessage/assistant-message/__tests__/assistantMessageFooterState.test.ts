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
  })
})
