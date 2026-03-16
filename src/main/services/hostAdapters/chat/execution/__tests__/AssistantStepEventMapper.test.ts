import { describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENTS, CHAT_RUN_STATES } from '@shared/chatRun/events'
import { AssistantStepEventMapper } from '../AssistantStepEventMapper'

describe('AssistantStepEventMapper', () => {
  it('maps phase and step message events to chat run events', () => {
    const emitter = {
      emit: vi.fn()
    } as any
    const mapper = new AssistantStepEventMapper(emitter)
    const message = {
      id: 101,
      body: {
        role: 'assistant',
        content: 'hello'
      }
    } as MessageEntity

    mapper.handlePhaseChange('receiving')
    mapper.emitMessageUpdated(message)
    mapper.emitToolResultAttached('tool-1', message)

    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.STREAMING
    })
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.MESSAGE_UPDATED, {
      message
    })
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.TOOL_RESULT_ATTACHED, {
      toolCallId: 'tool-1',
      message
    })
  })
})
