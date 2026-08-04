// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useReasoningTypewriter,
  type ReasoningTypewriterState,
  type UseReasoningTypewriterOptions
} from '../useReasoningTypewriter'

type FrameCallback = (timestamp: number) => void

function Probe(props: UseReasoningTypewriterOptions) {
  latestState = useReasoningTypewriter(props)
  return <div>{latestState.visibleContent}</div>
}

let latestState: ReasoningTypewriterState | undefined

describe('useReasoningTypewriter', () => {
  let container: HTMLDivElement
  let root: Root
  let animationFrames: Map<number, FrameCallback>
  let nextAnimationFrameId: number

  const renderProbe = async (options: UseReasoningTypewriterOptions): Promise<void> => {
    await act(async () => {
      root.render(<Probe {...options} />)
    })
  }

  const runNextFrame = async (timestamp: number): Promise<void> => {
    const nextFrame = animationFrames.entries().next().value as [number, FrameCallback] | undefined
    expect(nextFrame).toBeDefined()
    const [id, callback] = nextFrame as [number, FrameCallback]
    animationFrames.delete(id)
    await act(async () => {
      callback(timestamp)
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestState = undefined
    animationFrames = new Map()
    nextAnimationFrameId = 0

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameCallback) => {
      const id = ++nextAnimationFrameId
      animationFrames.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      animationFrames.delete(id)
    }))
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('reveals appended reasoning incrementally at the 28ms cadence', async () => {
    await renderProbe({
      segmentId: 'think-1',
      content: '',
      enabled: true,
      isStreaming: true
    })
    await renderProbe({
      segmentId: 'think-1',
      content: '甲乙丙',
      enabled: true,
      isStreaming: true
    })

    expect(latestState?.visibleContent).toBe('')
    await runNextFrame(0)
    expect(latestState?.visibleContent).toBe('甲')
    await runNextFrame(28)
    expect(latestState?.visibleContent).toBe('甲')
    await runNextFrame(32)
    expect(latestState?.visibleContent).toBe('甲乙')
    await runNextFrame(56)
    await runNextFrame(64)
    expect(latestState?.visibleContent).toBe('甲乙丙')
  })

  it.each([
    [16, 1],
    [17, 2],
    [48, 2],
    [49, 4]
  ])('consumes %i-token backlog in batches of %i', async (backlog, expectedVisibleCount) => {
    await renderProbe({
      segmentId: `think-${backlog}`,
      content: '甲'.repeat(backlog),
      enabled: true,
      isStreaming: true
    })

    await runNextFrame(0)
    expect(Array.from(latestState?.visibleContent ?? '')).toHaveLength(expectedVisibleCount)
  })

  it('flushes the current content when streaming completes', async () => {
    await renderProbe({
      segmentId: 'think-1',
      content: '甲乙丙丁',
      enabled: true,
      isStreaming: true
    })
    await runNextFrame(0)
    expect(latestState?.visibleContent).toBe('甲')

    await renderProbe({
      segmentId: 'think-1',
      content: '甲乙丙丁',
      enabled: true,
      isStreaming: false
    })

    expect(latestState).toEqual({ visibleContent: '甲乙丙丁', isTyping: false })
    expect(animationFrames).toHaveLength(0)
  })

  it('synchronizes disabled and reduced-motion presentation immediately', async () => {
    await renderProbe({
      segmentId: 'think-1',
      content: '初始内容',
      enabled: false,
      isStreaming: true
    })
    expect(latestState).toEqual({ visibleContent: '初始内容', isTyping: false })

    await renderProbe({
      segmentId: 'think-1',
      content: '初始内容追加',
      enabled: true,
      isStreaming: true,
      reducedMotion: true
    })
    expect(latestState).toEqual({ visibleContent: '初始内容追加', isTyping: false })
    expect(animationFrames).toHaveLength(0)
  })

  it('resets playback for a new segment and synchronizes same-id replacements', async () => {
    await renderProbe({
      segmentId: 'think-1',
      content: '甲乙丙',
      enabled: true,
      isStreaming: true
    })
    await runNextFrame(0)
    expect(latestState?.visibleContent).toBe('甲')

    await renderProbe({
      segmentId: 'think-2',
      content: '丁戊己',
      enabled: true,
      isStreaming: true
    })
    expect(latestState?.visibleContent).toBe('')
    await runNextFrame(0)
    expect(latestState?.visibleContent).toBe('丁')

    await renderProbe({
      segmentId: 'think-2',
      content: '替换后的完整内容',
      enabled: true,
      isStreaming: true
    })
    expect(latestState).toEqual({ visibleContent: '替换后的完整内容', isTyping: false })
    expect(animationFrames).toHaveLength(0)
  })

  it('throttles typing callbacks and cancels playback on unmount', async () => {
    const onTypingChange = vi.fn()
    await renderProbe({
      segmentId: 'think-1',
      content: '甲乙丙丁戊己庚辛壬癸',
      enabled: true,
      isStreaming: true,
      onTypingChange
    })

    await runNextFrame(0)
    await runNextFrame(28)
    await runNextFrame(32)
    expect(onTypingChange).toHaveBeenCalledTimes(1)
    await runNextFrame(56)
    await runNextFrame(64)
    expect(onTypingChange).toHaveBeenCalledTimes(2)

    await act(async () => {
      root.unmount()
    })
    expect(animationFrames).toHaveLength(0)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
