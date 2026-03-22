import { describe, expect, it } from 'vitest'
import { ChunkParser } from '../chunk-parser'

describe('ChunkParser', () => {
  it('returns ordered segment deltas for mixed text/think/text content', () => {
    const parser = new ChunkParser()

    const result = parser.parse(
      {
        content: '前置说明<think>内部推理</think>后置回答'
      } as IUnifiedResponse,
      []
    )

    expect(result.contentDelta).toBe('前置说明后置回答')
    expect(result.reasoningDelta).toBe('内部推理')
    expect(result.segmentDeltas).toEqual([
      { type: 'text', content: '前置说明' },
      { type: 'reasoning', content: '内部推理' },
      { type: 'text', content: '后置回答' }
    ])
  })

  it('supports multiple reasoning blocks in the same response stream', () => {
    const parser = new ChunkParser()

    const result = parser.parse(
      {
        content: '前文<think>第一段推理</think>中间<think>第二段推理</think>结尾'
      } as IUnifiedResponse,
      []
    )

    expect(result.contentDelta).toBe('前文中间结尾')
    expect(result.reasoningDelta).toBe('第一段推理第二段推理')
    expect(result.segmentDeltas).toEqual([
      { type: 'text', content: '前文' },
      { type: 'reasoning', content: '第一段推理' },
      { type: 'text', content: '中间' },
      { type: 'reasoning', content: '第二段推理' },
      { type: 'text', content: '结尾' }
    ])
  })
})
