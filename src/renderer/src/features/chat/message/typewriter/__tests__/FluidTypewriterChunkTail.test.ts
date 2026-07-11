import { describe, expect, it } from 'vitest'
import { buildChunkTailLayout } from '../FluidTypewriterChunkTail'

describe('buildChunkTailLayout', () => {
  it('keeps only the trailing animation window in animated chunks', () => {
    const layout = buildChunkTailLayout(
      ['hello', ' ', 'there', ' ', 'general', ' ', 'kenobi'],
      4
    )

    expect(layout.prefixText).toBe('hello there')
    expect(layout.animatedChunks.join('')).toBe(' general kenobi')
    expect(layout.tokenCount).toBe(7)
  })

  it('caps the animated chunk count by the configured chunk limit', () => {
    const layout = buildChunkTailLayout(
      ['a', ' ', 'b', ' ', 'c', ' ', 'd', ' ', 'e', ' ', 'f', ' ', 'g', ' ', 'h'],
      8,
      3
    )

    expect(layout.animatedChunks.length).toBeLessThanOrEqual(3)
    expect(layout.animatedChunkCount).toBeLessThanOrEqual(3)
  })

  it('marks only the newest non-whitespace chunk as animated', () => {
    const layout = buildChunkTailLayout(
      ['hello', ' ', 'there', ' ', 'general', ' ', 'kenobi'],
      6,
      4
    )

    expect(layout.lastAnimatedChunkIndex).toBeGreaterThanOrEqual(0)
    expect(layout.animatedChunkCount).toBe(1)
  })
})
