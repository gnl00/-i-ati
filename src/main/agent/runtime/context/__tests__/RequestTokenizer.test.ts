import { describe, expect, it } from 'vitest'
import { RequestTokenizer, resolveContextBudget } from '../RequestTokenizer'

describe('RequestTokenizer', () => {
  it('tokenizes multilingual text, JSON and literal special tokens without throwing', () => {
    const tokenizer = new RequestTokenizer('gpt-4o')
    expect(tokenizer.encoding).toBe('o200k_base')
    expect(tokenizer.estimated).toBe(false)
    expect(tokenizer.count('hello world')).toBe(2)
    expect(tokenizer.count('中文 😄 <|endoftext|> {"x":1}')).toBeGreaterThan(2)
  })
  it('bounds work for large uninterrupted tool payloads', () => {
    const tokenizer = new RequestTokenizer('gpt-4o')
    expect(tokenizer.count('x'.repeat(500_000))).toBeGreaterThan(0)
    expect(tokenizer.estimated).toBe(true)
  })
  it('marks unmatched model tokenization and missing context metadata as estimates', () => {
    const tokenizer = new RequestTokenizer('deepseek-v4-1-flash-260910')
    expect(tokenizer.estimated).toBe(true)
    const budget = resolveContextBudget(undefined, {}, tokenizer.estimated)
    expect(budget.windowUnknown).toBe(true)
    expect(budget.input + budget.output).toBeLessThan(budget.window)
  })
  it('reserves overridden output limits and scales beyond the old character ceiling', () => {
    const budget = resolveContextBudget(
      1_000_000,
      { max_output_tokens: 64_000, options: { maxTokens: 1_000 } },
      true
    )
    expect(budget.output).toBe(64_000)
    expect(budget.input).toBeGreaterThan(128_000)
    expect(resolveContextBudget(100, { max_tokens: 200 }, false).input).toBe(0)
  })
})
