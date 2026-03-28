import { describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENTS, CHAT_RUN_STATES } from '@shared/chatRun/events'
import { AssistantStepEventMapper } from '../AssistantStepEventMapper'

describe('AssistantStepEventMapper', () => {
  it('maps phase changes to chat run state events', () => {
    const emitter = {
      emit: vi.fn()
    } as any
    const mapper = new AssistantStepEventMapper(emitter)

    mapper.handlePhaseChange('receiving')

    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.STREAMING
    })
  })
})
