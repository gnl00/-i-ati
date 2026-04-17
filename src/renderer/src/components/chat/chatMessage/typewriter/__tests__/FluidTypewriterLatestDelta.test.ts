import { describe, expect, it } from 'vitest'
import { buildLatestDeltaLayout } from '../FluidTypewriterLatestDelta'

describe('buildLatestDeltaLayout', () => {
  it('isolates only the newest appended tokens into animated text', () => {
    const layout = buildLatestDeltaLayout(
      ['雨', '是', '在', '傍', '晚'],
      ['雨', '是', '在']
    )

    expect(layout.isAppendOnly).toBe(true)
    expect(layout.staticText).toBe('雨是在')
    expect(layout.animatedText).toBe('傍晚')
    expect(layout.animatedNodeCount).toBe(1)
  })

  it('downgrades whitespace-only appends into static text', () => {
    const layout = buildLatestDeltaLayout(
      ['hello', ' ', 'world', ' '],
      ['hello', ' ', 'world']
    )

    expect(layout.isAppendOnly).toBe(true)
    expect(layout.staticText).toBe('hello world ')
    expect(layout.animatedText).toBe('')
    expect(layout.animatedNodeCount).toBe(0)
  })

  it('falls back to fully static text when the current tokens are not append-only', () => {
    const layout = buildLatestDeltaLayout(
      ['hello', ' ', 'coder'],
      ['hello', ' ', 'world']
    )

    expect(layout.isAppendOnly).toBe(false)
    expect(layout.staticText).toBe('hello coder')
    expect(layout.animatedText).toBe('')
    expect(layout.animatedNodeCount).toBe(0)
  })
})
