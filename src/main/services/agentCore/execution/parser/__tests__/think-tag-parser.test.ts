import { describe, expect, it } from 'vitest'
import { ThinkTagParser } from '../think-tag-parser'
import { createInitialParserState, ThinkTagState } from '../parser-state'

describe('ThinkTagParser', () => {
  it('emits the first reasoning delta immediately after <think>', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const result = parser.parse('<think>\n用户想', state)

    expect(result).toEqual({
      reasoningDelta: '\n用户想',
      textDelta: ''
    })
    expect(state.thinkTagState).toBe(ThinkTagState.InThink)
    expect(state.thinkTagBuffer).toBe('')
  })

  it('does not replay accumulated reasoning when </think> arrives', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const chunk1 = parser.parse('<think>\n用户想', state)
    const chunk2 = parser.parse('测试 thinking 标签', state)
    const chunk3 = parser.parse('清楚具体需求。\n</think>\n\n测试目标是什么？', state)

    expect(chunk1).toEqual({
      reasoningDelta: '\n用户想',
      textDelta: ''
    })
    expect(chunk2).toEqual({
      reasoningDelta: '测试 thinking 标签',
      textDelta: ''
    })
    expect(chunk3).toEqual({
      reasoningDelta: '清楚具体需求。\n',
      textDelta: '\n\n测试目标是什么？'
    })
    expect(state.thinkTagState).toBe(ThinkTagState.EndThink)
  })

  it('handles opening think tags split across chunks', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const chunk1 = parser.parse('<thi', state)
    const chunk2 = parser.parse('nk>abc', state)

    expect(chunk1).toEqual({
      reasoningDelta: '',
      textDelta: ''
    })
    expect(chunk2).toEqual({
      reasoningDelta: 'abc',
      textDelta: ''
    })
    expect(state.thinkTagState).toBe(ThinkTagState.InThink)
  })

  it('handles closing think tags split across chunks', () => {
    const parser = new ThinkTagParser()
    const state = createInitialParserState()

    const chunk1 = parser.parse('<think>abc</thi', state)
    const chunk2 = parser.parse('nk>tail', state)

    expect(chunk1).toEqual({
      reasoningDelta: 'abc',
      textDelta: ''
    })
    expect(chunk2).toEqual({
      reasoningDelta: '',
      textDelta: 'tail'
    })
    expect(state.thinkTagState).toBe(ThinkTagState.EndThink)
  })
})
