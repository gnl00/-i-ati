import { describe, expect, it } from 'vitest'
import { HostRenderStateController } from '../HostRenderStateController'

describe('HostRenderStateController', () => {
  it('tracks preview, committed, lifecycle and usage from host render events', () => {
    const controller = new HostRenderStateController()

    controller.apply({
      type: 'host.lifecycle.updated',
      timestamp: 1,
      state: 'streaming'
    })

    controller.apply({
      type: 'host.preview.updated',
      timestamp: 2,
      preview: {
        stepId: 'step-1',
        content: 'Hello',
        blocks: [],
        toolCalls: []
      }
    })

    controller.apply({
      type: 'host.usage.updated',
      timestamp: 3,
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3
      }
    })

    const state = controller.apply({
      type: 'host.committed.updated',
      timestamp: 4,
      committed: {
        stepId: 'step-1',
        content: 'Hello',
        blocks: [],
        toolCalls: []
      },
      previewWasActive: true
    })

    expect(state.lifecycle).toBe('streaming')
    expect(state.lastUsage).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3
    })
    expect(state.preview).toBeNull()
    expect(state.committed.content).toBe('Hello')
  })
})
