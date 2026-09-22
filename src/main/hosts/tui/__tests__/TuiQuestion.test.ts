import { describe, expect, it } from 'vitest'
import type { ToolUserQuestion } from '@shared/tools/userQuestion'
import { parseQuestionAnswer } from '../TuiQuestion'

const question: ToolUserQuestion = {
  id: 'q',
  prompt: '选择',
  type: 'multi_select',
  required: true,
  options: [
    { id: 'a', label: '甲' },
    { id: 'b', label: '乙' }
  ],
  minSelections: 1,
  maxSelections: 2
}
describe('terminal question answers', () => {
  it('converts explicit option numbers to stable ids', () => {
    expect(parseQuestionAnswer(question, '1，2')).toEqual({
      questionId: 'q',
      optionIds: ['a', 'b']
    })
  })
  it.each(['', '1,1', '0', '3', 'abc'])('rejects invalid selections: %s', (input) => {
    expect(() => parseQuestionAnswer(question, input)).toThrow()
  })
  it('enforces single selection, required text and text limits', () => {
    expect(() => parseQuestionAnswer({ ...question, type: 'single_select' }, '1,2')).toThrow()
    const text: ToolUserQuestion = {
      id: 'text',
      type: 'text',
      required: true,
      prompt: 'text',
      maxLength: 5
    }
    expect(() => parseQuestionAnswer(text, '')).toThrow()
    expect(() => parseQuestionAnswer(text, '123456')).toThrow()
    expect(parseQuestionAnswer(text, '你好')).toEqual({ questionId: 'text', text: '你好' })
  })
})
