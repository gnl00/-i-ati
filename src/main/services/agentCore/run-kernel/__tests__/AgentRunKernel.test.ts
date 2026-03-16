import { describe, expect, it } from 'vitest'
import { AgentRunKernel } from '../AgentRunKernel'

describe('AgentRunKernel', () => {
  it('returns completed with step result on success', async () => {
    const kernel = new AgentRunKernel()

    const result = await kernel.run(async () => ({
      completed: true,
      finishReason: 'completed',
      usage: undefined,
      messages: [],
      artifacts: []
    }))

    expect(result).toEqual({
      state: 'completed',
      stepResult: {
        completed: true,
        finishReason: 'completed',
        usage: undefined,
        messages: [],
        artifacts: []
      }
    })
  })

  it('returns aborted when step throws AbortError-like error', async () => {
    const kernel = new AgentRunKernel()

    const result = await kernel.run(async () => {
      const error = new Error('cancelled')
      error.name = 'AbortError'
      throw error
    })

    expect(result).toEqual({
      state: 'aborted'
    })
  })

  it('serializes unknown failures', async () => {
    const kernel = new AgentRunKernel()

    const result = await kernel.run(async () => {
      throw new Error('boom')
    })

    expect(result).toEqual({
      state: 'failed',
      error: expect.objectContaining({
        name: 'Error',
        message: 'boom'
      })
    })
  })
})
