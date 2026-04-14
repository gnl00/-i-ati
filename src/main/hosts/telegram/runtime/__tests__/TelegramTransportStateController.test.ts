import { describe, expect, it } from 'vitest'
import type { AgentRenderMessageState, AgentRenderToolCallState } from '@main/hosts/shared/render'
import { TelegramTransportStateController } from '../TelegramTransportStateController'

const toolCall = (
  args: Partial<AgentRenderToolCallState> & Pick<AgentRenderToolCallState, 'toolCallId' | 'name' | 'status'>
): AgentRenderToolCallState => ({
  toolCallId: args.toolCallId,
  toolCallIndex: args.toolCallIndex ?? 0,
  name: args.name,
  status: args.status,
  ...(args.result !== undefined ? { result: args.result } : {})
})

const assistantState = (args: {
  stepId?: string
  text?: string
  toolCalls?: AgentRenderToolCallState[]
} = {}): AgentRenderMessageState => {
  const {
    stepId = 'step-1',
    text = '',
    toolCalls = []
  } = args

  return {
    stepId,
    content: text,
    blocks: [
      ...(text
        ? [{
          kind: 'text' as const,
          blockId: `${stepId}:text:0`,
          stepId,
          content: text,
          startedAt: 1
        }]
        : []),
      ...toolCalls.map((entry, index) => ({
        kind: 'tool' as const,
        blockId: `${stepId}:tool:${index}`,
        stepId,
        toolCallId: entry.toolCallId,
        startedAt: index + 2
      }))
    ],
    toolCalls
  }
}

describe('TelegramTransportStateController', () => {
  it('appends short sticky follow-up after preview is cleared', () => {
    const controller = new TelegramTransportStateController()

    controller.update({
      previewState: assistantState({ text: 'First cycle answer' })
    })
    controller.markSent()
    controller.captureStickyPreviewBase({
      latestAssistantState: assistantState({
        toolCalls: [
          toolCall({
            toolCallId: 'tool-1',
            name: 'emotion_report',
            status: 'success',
            result: { ok: true }
          })
        ]
      })
    })

    const transport = controller.update({
      previewState: assistantState({ text: '👍' })
    })

    expect(transport.text).toBe('First cycle answer👍')
  })

  it('does not append substantive replacement preview text', () => {
    const controller = new TelegramTransportStateController()

    controller.update({
      previewState: assistantState({ text: 'First cycle answer' })
    })
    controller.markSent()
    controller.captureStickyPreviewBase({
      latestAssistantState: assistantState({ text: 'First cycle answer' })
    })

    const transport = controller.update({
      previewState: assistantState({ text: 'A much longer replacement answer' })
    })

    expect(transport.text).toBe('A much longer replacement answer')
  })
})
