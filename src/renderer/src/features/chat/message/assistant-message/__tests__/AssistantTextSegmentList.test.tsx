// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantTextSegmentList } from '../renderers/AssistantTextSegmentList'
import type { TextSegmentRenderItem } from '../model/assistantMessageMapper'

const getSegmentState = vi.fn()
const typewriterMock = vi.hoisted(() => ({
  useMessageTypewriter: vi.fn()
}))

vi.mock('../../typewriter/use-message-typewriter', () => ({
  useMessageTypewriter: (props: unknown) => {
    typewriterMock.useMessageTypewriter(props)
    return {
      getSegmentState,
      isAllComplete: false,
      forceComplete: vi.fn(),
      isStreaming: true
    }
  }
}))

vi.mock('../renderers/AssistantTextSegmentContent', () => ({
  AssistantTextSegmentContent: ({
    segment,
    visibleText,
    isTyping,
    animateOnMount
  }: {
    segment: TextSegment
    visibleText?: string
    isTyping: boolean
    animateOnMount?: boolean
  }) => (
    <div
      data-testid={`text-${segment.segmentId}`}
      data-visible={visibleText ?? segment.content}
      data-typing={isTyping ? 'yes' : 'no'}
      data-animate-mount={animateOnMount === false ? 'no' : 'yes'}
    />
  )
}))

const textSegment = (id: string, content: string, timestamp = 1): TextSegment => ({
  type: 'text',
  segmentId: id,
  content,
  timestamp
})

const textItem = (
  segment: TextSegment,
  sourceIndex: number
): TextSegmentRenderItem => ({
  key: `preview-${segment.segmentId}-${sourceIndex}`,
  layer: 'preview',
  sourceIndex,
  order: sourceIndex,
  segment
})

describe('AssistantTextSegmentList', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    getSegmentState.mockReset()
    typewriterMock.useMessageTypewriter.mockReset()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('queries typewriter state by segmentId when source index points into mixed segments', async () => {
    const segment = textSegment('preview:step-1:text:0', 'hello world')
    getSegmentState.mockImplementation((segmentId: string) => ({
      shouldRender: segmentId === segment.segmentId,
      visibleLength: 1,
      visibleTokens: ['hello'],
      isTyping: true
    }))

    await act(async () => {
      root.render(
        <AssistantTextSegmentList
          index={0}
          committedPlaybackInput={{
            role: 'assistant',
            segments: []
          }}
          previewPlaybackInput={{
            role: 'assistant',
            source: 'stream_preview',
            typewriterCompleted: false,
            segments: [segment]
          }}
          isLatest
          items={[textItem(segment, 1)]}
          isOverlayPreview
        />
      )
    })

    expect(getSegmentState).toHaveBeenCalledWith(segment.segmentId)
    const rendered = container.querySelector(`[data-testid="text-${segment.segmentId}"]`)
    expect(rendered?.getAttribute('data-visible')).toBe('hello')
    expect(rendered?.getAttribute('data-typing')).toBe('yes')
  })

  it('disables historical playback while preserving live preview playback', async () => {
    getSegmentState.mockReturnValue({
      shouldRender: true,
      visibleLength: 0,
      visibleTokens: [],
      isTyping: false
    })

    const committedSegment = textSegment('committed:history:text:0', 'historical answer')
    await act(async () => {
      root.render(
        <AssistantTextSegmentList
          index={0}
          committedPlaybackInput={{
            role: 'assistant',
            segments: [committedSegment]
          }}
          previewPlaybackInput={{
            role: 'assistant',
            source: 'stream_preview',
            typewriterCompleted: false,
            segments: []
          }}
          isLatest
          animateOnMount={false}
          items={[{
            key: 'committed-history',
            layer: 'committed',
            sourceIndex: 0,
            order: 0,
            segment: committedSegment
          }]}
          isOverlayPreview={false}
        />
      )
    })

    expect(typewriterMock.useMessageTypewriter.mock.calls[0]?.[0]).toMatchObject({
      playbackEnabled: false
    })

    const previewSegment = textSegment('preview:live:text:0', 'live answer')
    await act(async () => {
      root.render(
        <AssistantTextSegmentList
          index={0}
          committedPlaybackInput={{
            role: 'assistant',
            segments: []
          }}
          previewPlaybackInput={{
            role: 'assistant',
            source: 'stream_preview',
            typewriterCompleted: false,
            segments: [previewSegment]
          }}
          isLatest
          animateOnMount
          items={[{
            key: 'preview-live',
            layer: 'preview',
            sourceIndex: 0,
            order: 0,
            segment: previewSegment
          }]}
          isOverlayPreview
        />
      )
    })

    expect(typewriterMock.useMessageTypewriter.mock.calls.at(-1)?.[0]).toMatchObject({
      playbackEnabled: true
    })
  })
})
