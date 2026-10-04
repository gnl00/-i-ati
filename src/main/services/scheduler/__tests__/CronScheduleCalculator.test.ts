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

  it('includes an occurrence exactly at the reconciliation time', () => {
    const latest = calculator.latest('30 9 * * *', 'Asia/Shanghai', Date.parse('2026-07-22T01:30:00Z'))
    expect(new Date(latest).toISOString()).toBe('2026-07-22T01:30:00.000Z')
  })

  it('finds the latest due occurrence after a long offline interval', () => {
    const latest = calculator.latest('30 9 * * *', 'Asia/Shanghai', Date.parse('2026-07-22T01:29:00Z'))
    expect(new Date(latest).toISOString()).toBe('2026-07-21T01:30:00.000Z')
  })

  it.each([
    ['30 2 * * *', '2026-03-08T07:30:00.000Z'],
    ['0,30 2 * * *', '2026-03-08T07:30:00.000Z'],
    ['* 2 * * *', '2026-03-08T07:35:00.000Z']
  ])('retains the forward spring schedule for %s', (expression, expected) => {
    const latest = calculator.latest(expression, 'America/New_York', Date.parse('2026-03-08T07:35:00Z'))
    expect(new Date(latest).toISOString()).toBe(expected)
  })

  it.each([
    ['30 1 * * *', '2026-11-01T05:30:00.000Z'],
    ['0,30 1 * * *', '2026-11-01T05:30:00.000Z'],
    ['* 1 * * *', '2026-11-01T05:59:00.000Z']
  ])('preserves the forward fall-back schedule for %s', (expression, expected) => {
    const latest = calculator.latest(expression, 'America/New_York', Date.parse('2026-11-01T06:35:00Z'))
    expect(new Date(latest).toISOString()).toBe(expected)
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
