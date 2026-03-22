import { describe, expect, it } from 'vitest'
import { ThinkTagParser } from '../think-tag-parser'
import { createInitialParserState, ThinkTagMode } from '../parser-state'

describe('ThinkTagParser', () => {
  it('emits the first reasoning delta immediately after <think>', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const result = parser.parse('<think>\n用户想', state)

    expect(result).toEqual([
      { type: 'reasoning', content: '\n用户想' }
    ])
    expect(state.thinkTagMode).toBe(ThinkTagMode.Inside)
    expect(state.pendingThinkTagPrefix).toBe('')
  })

  it('does not replay accumulated reasoning when </think> arrives', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const chunk1 = parser.parse('<think>\n用户想', state)
    const chunk2 = parser.parse('测试 thinking 标签', state)
    const chunk3 = parser.parse('清楚具体需求。\n</think>\n\n测试目标是什么？', state)

    expect(chunk1).toEqual([
      { type: 'reasoning', content: '\n用户想' }
    ])
    expect(chunk2).toEqual([
      { type: 'reasoning', content: '测试 thinking 标签' }
    ])
    expect(chunk3).toEqual([
      { type: 'reasoning', content: '清楚具体需求。\n' },
      { type: 'text', content: '\n\n测试目标是什么？' }
    ])
    expect(state.thinkTagMode).toBe(ThinkTagMode.Outside)
  })

  it('handles opening think tags split across chunks', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const chunk1 = parser.parse('<thi', state)
    const chunk2 = parser.parse('nk>abc', state)

    expect(chunk1).toEqual([])
    expect(chunk2).toEqual([
      { type: 'reasoning', content: 'abc' }
    ])
    expect(state.thinkTagMode).toBe(ThinkTagMode.Inside)
  })

  it('handles closing think tags split across chunks', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const chunk1 = parser.parse('<think>abc</thi', state)
    const chunk2 = parser.parse('nk>tail', state)

    expect(chunk1).toEqual([
      { type: 'reasoning', content: 'abc' }
    ])
    expect(chunk2).toEqual([
      { type: 'text', content: 'tail' }
    ])
    expect(state.thinkTagMode).toBe(ThinkTagMode.Outside)
  })

  it('preserves text-think-text ordering within a single chunk', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const result = parser.parse(
      '也记下来 —\n<think>内部推理</think>\n\n最终回答',
      state
    )

    expect(result).toEqual([
      { type: 'text', content: '也记下来 —\n' },
      { type: 'reasoning', content: '内部推理' },
      { type: 'text', content: '\n\n最终回答' }
    ])
    expect(state.thinkTagMode).toBe(ThinkTagMode.Outside)
  })

  it('continues parsing subsequent think tags as reasoning blocks', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const first = parser.parse('<think>一次推理</think>', state)
    const second = parser.parse('<think>二次推理</think>', state)

    expect(first).toEqual([
      { type: 'reasoning', content: '一次推理' }
    ])
    expect(second).toEqual([
      { type: 'reasoning', content: '二次推理' }
    ])
  })

  it('supports multiple think blocks with interleaved text in one chunk', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const result = parser.parse(
      '前文<think>第一段推理</think>中间<think>第二段推理</think>结尾',
      state
    )

    expect(result).toEqual([
      { type: 'text', content: '前文' },
      { type: 'reasoning', content: '第一段推理' },
      { type: 'text', content: '中间' },
      { type: 'reasoning', content: '第二段推理' },
      { type: 'text', content: '结尾' }
    ])
    expect(state.thinkTagMode).toBe(ThinkTagMode.Outside)
  })
})
