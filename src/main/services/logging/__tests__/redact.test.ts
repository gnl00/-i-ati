import { describe, expect, it } from 'vitest'
import { formatConsoleArgs, sanitizeLogValue, serializeError } from '../redact'

describe('redact helpers', () => {
  it('redacts sensitive keys and truncates long strings', () => {
    const value = sanitizeLogValue({
      authorization: 'Bearer secret-token',
      nested: {
        apiKey: 'abc123',
        message: 'x'.repeat(2100)
      }
    }) as Record<string, any>

    expect(value.authorization).toBe('[REDACTED]')
    expect(value.nested.apiKey).toBe('[REDACTED]')
    expect(value.nested.message).toContain('<truncated:')
  })

  it('serializes Error objects into stable log payloads', () => {
    const error = new Error('boom')
    const serialized = serializeError(error)

    expect(serialized).toMatchObject({
      name: 'Error',
      message: 'boom'
    })
    expect(serialized?.stack).toContain('Error: boom')
  })

  it('formats console args into message and sanitized context', () => {
    const payload = formatConsoleArgs(['hello', { token: 'secret', count: 2 }])

    expect(payload.message).toBe('hello')
    expect(payload.context).toEqual({
      token: '[REDACTED]',
      count: 2
    })
  })
})
