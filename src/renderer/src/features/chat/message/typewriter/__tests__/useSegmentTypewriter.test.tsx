// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  useSegmentTypewriter,
  type SegmentTypewriterRenderState
} from '../useSegmentTypewriter'

const textSegment = (segmentId: string, content: string): TextSegment => ({
  type: 'text',
  segmentId,
  content,
  timestamp: 1
})

describe('useSegmentTypewriter', () => {
  let container: HTMLDivElement
  let root: Root
  let latestState: SegmentTypewriterRenderState | undefined

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestState = undefined
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders newly added segments immediately when playback is disabled', async () => {
    const segment = textSegment('text-1', 'hello world')

    function Probe({ segments }: { segments: TextSegment[] }) {
      const typewriter = useSegmentTypewriter(segments, {
        enabled: false
      })
      latestState = typewriter.getSegmentState(segment.segmentId)
      return null
    }

    await act(async () => {
      root.render(<Probe segments={[]} />)
    })

    expect(latestState?.shouldRender).toBe(false)

    await act(async () => {
      root.render(<Probe segments={[segment]} />)
    })

    expect(latestState?.shouldRender).toBe(true)
    expect(latestState?.visibleLength).toBe(Infinity)
    expect(latestState?.visibleTokens.join('')).toBe('hello world')
    expect(latestState?.isTyping).toBe(false)
  })
})
