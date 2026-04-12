import { describe, expect, it } from 'vitest'
import {
  ThinkTagTokenizer,
  type ThinkTagTokenizerState
} from '../ThinkTagTokenizer'

const createState = (): ThinkTagTokenizerState => ({
  isInThinkTag: false,
  pendingThinkTagPrefix: ''
})

describe('ThinkTagTokenizer', () => {
  it('emits the first reasoning token immediately after <think>', () => {
    const tokenizer = new ThinkTagTokenizer()
    const state = createState()

    const result = tokenizer.parse('<think>\n用户想', state)

    expect(result).toEqual([
      { type: 'reasoning', content: '\n用户想' }
    ])
    expect(state).toEqual({
      isInThinkTag: true,
      pendingThinkTagPrefix: ''
    })
  })

  it('does not replay accumulated reasoning when </think> arrives', () => {
    const tokenizer = new ThinkTagTokenizer()
    const state = createState()

    const chunk1 = tokenizer.parse('<think>\n用户想', state)
    const chunk2 = tokenizer.parse('测试 thinking 标签', state)
    const chunk3 = tokenizer.parse('清楚具体需求。\n</think>\n\n测试目标是什么？', state)

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
    expect(state).toEqual({
      isInThinkTag: false,
      pendingThinkTagPrefix: ''
    })
  })

  it('handles opening think tags split across chunks', () => {
    const tokenizer = new ThinkTagTokenizer()
    const state = createState()

    const chunk1 = tokenizer.parse('<thi', state)
    const chunk2 = tokenizer.parse('nk>abc', state)

    expect(chunk1).toEqual([])
    expect(chunk2).toEqual([
      { type: 'reasoning', content: 'abc' }
    ])
    expect(state).toEqual({
      isInThinkTag: true,
      pendingThinkTagPrefix: ''
    })
  })

  it('handles closing think tags split across chunks', () => {
    const tokenizer = new ThinkTagTokenizer()
    const state = createState()

    const chunk1 = tokenizer.parse('<think>abc</thi', state)
    const chunk2 = tokenizer.parse('nk>tail', state)

    expect(chunk1).toEqual([
      { type: 'reasoning', content: 'abc' }
    ])
    expect(chunk2).toEqual([
      { type: 'text', content: 'tail' }
    ])
    expect(state).toEqual({
      isInThinkTag: false,
      pendingThinkTagPrefix: ''
    })
  })

  it('preserves text-think-text ordering within a single chunk', () => {
    const tokenizer = new ThinkTagTokenizer()
    const state = createState()

    const result = tokenizer.parse(
      '也记下来 —\n<think>内部推理</think>\n\n最终回答',
      state
    )

    expect(result).toEqual([
      { type: 'text', content: '也记下来 —\n' },
      { type: 'reasoning', content: '内部推理' },
      { type: 'text', content: '\n\n最终回答' }
    ])
    expect(state).toEqual({
      isInThinkTag: false,
      pendingThinkTagPrefix: ''
    })
  })

  it('continues parsing subsequent think tags as reasoning blocks', () => {
    const tokenizer = new ThinkTagTokenizer()
    const state = createState()

    const first = tokenizer.parse('<think>一次推理</think>', state)
    const second = tokenizer.parse('<think>二次推理</think>', state)

    expect(first).toEqual([
      { type: 'reasoning', content: '一次推理' }
    ])
    expect(second).toEqual([
      { type: 'reasoning', content: '二次推理' }
    ])
  })

  it('supports multiple think blocks with interleaved text in one chunk', () => {
    const tokenizer = new ThinkTagTokenizer()
    const state = createState()

    const result = tokenizer.parse(
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
    expect(state).toEqual({
      isInThinkTag: false,
      pendingThinkTagPrefix: ''
    })
  })
})
