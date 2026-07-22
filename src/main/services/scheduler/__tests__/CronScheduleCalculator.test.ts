import { describe, expect, it } from 'vitest'
import { CronScheduleCalculator } from '../CronScheduleCalculator'

describe('CronScheduleCalculator', () => {
  const calculator = new CronScheduleCalculator()

  it('calculates a minute-precision occurrence in an IANA timezone', () => {
    const next = calculator.next('30 9 * * *', 'Asia/Shanghai', Date.parse('2026-07-22T01:29:00Z'))
    expect(new Date(next).toISOString()).toBe('2026-07-22T01:30:00.000Z')
  })

  it('moves a spring-forward occurrence to the first valid local time', () => {
    const next = calculator.next('30 2 * * *', 'America/New_York', Date.parse('2026-03-08T06:00:00Z'))
    expect(new Date(next).toISOString()).toBe('2026-03-08T07:30:00.000Z')
  })

  it.each([
    ['0 9 1 * 1', 'day-of-month'],
    ['0 0 9 * * *', 'exactly 5 fields'],
    ['@daily', 'exactly 5 fields'],
    ['H 9 * * *', 'standard numeric'],
    ['0 9 L * *', 'standard numeric'],
    ['0 9 * * 1#2', 'standard numeric'],
    ['0 9 ? * *', 'standard numeric'],
    ['0 9 * JAN *', 'standard numeric'],
    ['0 9 * * MON', 'standard numeric']
  ])('rejects unsupported expression %s', (expression, message) => {
    expect(() => calculator.validate(expression, 'UTC')).toThrow(message)
  })

  it('requires a valid IANA timezone', () => {
    expect(() => calculator.validate('0 9 * * *', '')).toThrow('timezone is required')
    expect(() => calculator.validate('0 9 * * *', 'Mars/Olympus')).toThrow('Invalid IANA timezone')
  })
})
