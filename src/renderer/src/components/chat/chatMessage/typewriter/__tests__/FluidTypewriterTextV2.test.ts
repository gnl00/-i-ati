import { describe, expect, it } from 'vitest'
import { buildFluidTypewriterTextV2Layout } from '../FluidTypewriterTextV2'

describe('buildFluidTypewriterTextV2Layout', () => {
  it('splits visible content into static prefix, settled tail, and live tokens', () => {
    const layout = buildFluidTypewriterTextV2Layout({
      tokens: ['雨', '是', '在', '傍', '晚', '六', '点', '零', '七', '分'],
      animationWindow: 6,
      liveTokenLimit: 3
    })

    expect(layout.staticPrefixText).toBe('雨是在傍')
    expect(layout.settledTailText).toBe('晚六点')
    expect(layout.liveAnimatedTokens).toEqual(['零', '七', '分'])
    expect(layout.liveStartIndex).toBe(7)
  })

  it('keeps all visible tokens live when content is shorter than the live limit', () => {
    const layout = buildFluidTypewriterTextV2Layout({
      tokens: ['yo', ' ', '爹'],
      animationWindow: 8,
      liveTokenLimit: 4
    })

    expect(layout.staticPrefixText).toBe('')
    expect(layout.settledTailText).toBe('')
    expect(layout.liveAnimatedTokens).toEqual(['yo', ' ', '爹'])
  })

  it('keeps the live token limit even when the animation window is smaller', () => {
    const layout = buildFluidTypewriterTextV2Layout({
      tokens: ['a', 'b', 'c', 'd'],
      animationWindow: 1,
      liveTokenLimit: 2
    })

    expect(layout.settledTailText).toBe('')
    expect(layout.liveAnimatedTokens).toEqual(['c', 'd'])
  })
})
