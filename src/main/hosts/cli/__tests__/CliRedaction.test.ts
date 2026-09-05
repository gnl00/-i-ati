import { describe, expect, it } from 'vitest'
import { redactCliValue } from '../CliRedaction'

describe('redactCliValue', () => {
  it('preserves usage counters while redacting credential fields and values', () => {
    const secret = 'cli-secret-123456'
    const value = redactCliValue({
      apiKey: secret,
      finalText: `provider returned ${secret}`,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        promptCacheHitTokens: 70,
        reasoningTokens: 4
      }
    }, [secret]) as {
      apiKey: string
      finalText: string
      usage: Record<string, number>
    }

    expect(value.apiKey).toBe('[REDACTED]')
    expect(value.finalText).not.toContain(secret)
    expect(value.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      promptCacheHitTokens: 70,
      reasoningTokens: 4
    })
  })

  it('retains complete long strings and arrays', () => {
    const text = 'x'.repeat(12_000)
    const value = redactCliValue({ text, values: [text, 1, 2, 3] }) as {
      text: string
      values: unknown[]
    }

    expect(value.text).toBe(text)
    expect(value.values).toHaveLength(4)
    expect(value.values[0]).toBe(text)
  })
})
