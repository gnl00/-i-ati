// @vitest-environment happy-dom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantMessageBody } from '../AssistantMessageBody'
import { mapAssistantMessage } from '../model/assistantMessageMapper'
import { buildAssistantMessageTextPlaybackModel } from '../model/assistantMessageTextPlayback'

vi.mock('../renderers/AssistantTextSegmentList', () => ({
  AssistantTextSegmentList: ({ items }: { items: { segment: TextSegment }[] }): ReactElement => (
    <div data-testid="answer">{items.map(item => item.segment.content).join('')}</div>
  )
}))
vi.mock('../renderers/AssistantTextSegmentContent', () => ({
  AssistantTextSegmentContent: ({ segment }: { segment: TextSegment }): ReactElement => <p>{segment.content}</p>
}))
vi.mock('../renderers/AssistantSupportSegmentList', () => ({
  AssistantSupportSegmentList: (): ReactElement => <div>Tool and reasoning details</div>
}))

describe('whole-turn work presentation', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  const render = async (status: ChatMessage['workStatus'], toolStatus = 'completed', error = false): Promise<void> => {
    const message: ChatMessage = {
      role: 'assistant', content: 'Result', segments: [
        { type: 'text', segmentId: 'intro', content: 'Let me check.', timestamp: 1 },
        { type: 'reasoning', segmentId: 'thought', content: 'Check source.', timestamp: 2 },
        { type: 'toolCall', segmentId: 'tool', toolCallId: 'call', toolCallIndex: 0, name: 'read', timestamp: 3, isError: false, content: { toolName: 'read', status: toolStatus } },
        { type: 'text', segmentId: 'answer', content: 'Result', timestamp: 4 },
        ...(error ? [{ type: 'error' as const, segmentId: 'error', content: 'Failed', error: { name: 'Error', message: 'Failed', timestamp: 5 } }] : [])
      ]
    }
    const source = { committedMessage: message }
    const { transcript } = mapAssistantMessage(source, { isLatest: true, isStreaming: status === 'running', accounts: [], providerDefinitions: [] })
    await act(async () => root.render(<AssistantMessageBody model={{
      index: 0, isLatest: true, animateOnMount: false, workStatus: status, transcript,
      textPlayback: buildAssistantMessageTextPlaybackModel(source, transcript.textItems)
    }} />))
  }

  it('keeps commentary inside one stable expanded group until the answer finishes', async () => {
    await render('running')
    const group = container.querySelector('[data-testid="assistant-completed-work-group"]')!
    const trigger = group.querySelector('button')!
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(group.textContent).toContain('Let me check.')
    expect(group.textContent).not.toContain('Result')
    expect(container.querySelector('[data-testid="answer"]')?.textContent).toBe('Result')
    await render('completed')
    expect(container.querySelector('[data-testid="assistant-completed-work-group"]')).toBe(group)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it.each(['failed', 'aborted', 'incomplete'] as const)('preserves %s work for inspection', async status => {
    await render(status)
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('does not hide pending tools or errors behind a completed label', async () => {
    await render('completed', 'pending')
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
    await render('completed', 'completed', true)
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
  })
})
