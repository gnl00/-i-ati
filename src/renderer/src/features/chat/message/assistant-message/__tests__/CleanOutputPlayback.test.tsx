// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantMessageBody } from '../AssistantMessageBody'
import { mapAssistantMessage } from '../model/assistantMessageMapper'
import { buildAssistantMessageTextPlaybackModel } from '../model/assistantMessageTextPlayback'
import { useChatStore } from '@renderer/features/chat/state/chatStore'

const motionPreference = vi.hoisted(() => ({ reduced: false }))
vi.mock('framer-motion', async importOriginal => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: (): boolean => motionPreference.reduced
}))
vi.mock('../renderers/AssistantTextSegmentContent', () => ({
  AssistantTextSegmentContent: ({ segment, visibleText, isTyping }: {
    segment: TextSegment; visibleText?: string; isTyping: boolean
  }): React.ReactElement => <p data-testid="answer" data-typing={String(isTyping)}>{visibleText ?? segment.content}</p>
}))

describe('clean output completion playback', () => {
  let container: HTMLDivElement
  let root: Root
  let frames: Map<number, FrameRequestCallback>
  let frameId: number
  let time: number
  const answer = 'Clean output should reveal this answer progressively after the entire run finishes.'
  const message: ChatMessage = {
    role: 'assistant', content: answer, typewriterCompleted: true,
    segments: [{ type: 'text', segmentId: 'answer', content: answer, timestamp: 1 }]
  }
  const source = { committedMessage: message }
  const { transcript } = mapAssistantMessage(source, { isLatest: true, isStreaming: false, accounts: [], providerDefinitions: [] })
  const textPlayback = buildAssistantMessageTextPlaybackModel(source, transcript.textItems)
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    motionPreference.reduced = false
    frames = new Map()
    frameId = 0
    time = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => { frames.delete(id) })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    useChatStore.setState({ runPhase: 'idle', messages: [] })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })
  const render = async (active: boolean, clean = true, isLatest = true): Promise<void> => {
    await act(async () => root.render(<AssistantMessageBody model={{
      index: 0, isLatest, animateOnMount: true, cleanOutput: clean, cleanOutputActive: active,
      workStatus: active ? 'running' : 'completed', transcript, textPlayback
    }} />))
  }
  const advance = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index++) {
      time += 32
      await act(async () => {
        const pending = [...frames.values()]
        frames.clear()
        pending.forEach(callback => callback(time))
      })
    }
  }

  it('replays a finalized message through the existing typewriter only after the clean run finishes', async () => {
    await render(true)
    expect(container.querySelector('[data-testid="answer"]')).toBeNull()
    await render(false)
    expect(container.textContent).not.toContain(answer)
    await advance(3)
    const partial = container.querySelector('[data-testid="answer"]')?.textContent ?? ''
    expect(partial.length).toBeGreaterThan(0)
    expect(partial.length).toBeLessThan(answer.length)
    await advance(100)
    expect(container.querySelector('[data-testid="answer"]')?.textContent).toBe(answer)
    expect(container.querySelector('[data-testid="answer"]')?.getAttribute('data-typing')).toBe('false')
    await render(false)
    expect(container.querySelector('[data-testid="answer"]')?.textContent).toBe(answer)
    expect(message.typewriterCompleted).toBe(true)
  })

  it('shows history immediately and avoids replay on a post-completion mode toggle', async () => {
    await render(false)
    expect(container.textContent).toBe(answer)
    await render(false, false)
    await render(false)
    expect(container.textContent).toBe(answer)
  })

  it('shows complete text immediately with reduced motion or when the message loses latest position', async () => {
    motionPreference.reduced = true
    await render(true)
    await render(false)
    expect(container.textContent).toBe(answer)
    motionPreference.reduced = false
    await render(true)
    await render(false, true, false)
    expect(container.textContent).toBe(answer)
  })
})
