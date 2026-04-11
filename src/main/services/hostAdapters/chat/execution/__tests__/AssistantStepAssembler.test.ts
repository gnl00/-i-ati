import { describe, expect, it } from 'vitest'
import { AssistantStepAssembler } from '../AssistantStepAssembler'

describe('AssistantStepAssembler', () => {
  it('requires legacy snapshot segments to provide stable segment ids', () => {
    const assembler = new AssistantStepAssembler({
      role: 'assistant',
      content: '',
      segments: []
    })

    expect(() => assembler.updatePreview({
      content: 'hello',
      toolCalls: [],
      segments: [
        {
          type: 'text',
          content: 'hello',
          timestamp: 100
        }
      ] as MessageSegment[]
    })).toThrow('[legacy-chat-host-preview] Message segment at index 0 (text) is missing required segmentId')
  })
})
