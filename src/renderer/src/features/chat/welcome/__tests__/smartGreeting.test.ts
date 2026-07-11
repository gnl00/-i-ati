import { describe, expect, it } from 'vitest'
import {
  getMsUntilNextSmartGreetingRefresh,
  getNextTimeOfDayBoundary,
  getTimeOfDay,
  pickSmartGreeting
} from '../smartGreeting'

describe('smartGreeting', () => {
  it('maps local hours to greeting periods', () => {
    expect(getTimeOfDay(4)).toBe('night')
    expect(getTimeOfDay(5)).toBe('morning')
    expect(getTimeOfDay(11)).toBe('morning')
    expect(getTimeOfDay(12)).toBe('afternoon')
    expect(getTimeOfDay(17)).toBe('afternoon')
    expect(getTimeOfDay(18)).toBe('evening')
    expect(getTimeOfDay(21)).toBe('evening')
    expect(getTimeOfDay(22)).toBe('night')
  })

  it('picks a line from the current period using the supplied random source', () => {
    expect(pickSmartGreeting(new Date(2026, 0, 1, 9), () => 0)).toEqual({
      timeOfDay: 'morning',
      subtitleText: "Let's start with one sharp priority."
    })

    expect(pickSmartGreeting(new Date(2026, 0, 1, 18), () => 0.99)).toEqual({
      timeOfDay: 'evening',
      subtitleText: 'Want a clean handoff for tomorrow?'
    })
  })

  it('returns the next local time period boundary', () => {
    expect(getNextTimeOfDayBoundary(new Date(2026, 0, 1, 4, 30)).getHours()).toBe(5)
    expect(getNextTimeOfDayBoundary(new Date(2026, 0, 1, 11, 59, 59)).getHours()).toBe(12)
    expect(getNextTimeOfDayBoundary(new Date(2026, 0, 1, 17, 30)).getHours()).toBe(18)
    expect(getNextTimeOfDayBoundary(new Date(2026, 0, 1, 21, 45)).getHours()).toBe(22)

    const nextMorning = getNextTimeOfDayBoundary(new Date(2026, 0, 1, 22, 10))
    expect(nextMorning.getDate()).toBe(2)
    expect(nextMorning.getHours()).toBe(5)
  })

  it('returns the milliseconds until the next greeting refresh', () => {
    expect(getMsUntilNextSmartGreetingRefresh(new Date(2026, 0, 1, 4, 59, 30))).toBe(30_000)
    expect(getMsUntilNextSmartGreetingRefresh(new Date(2026, 0, 1, 21, 59, 59))).toBe(1_000)
    expect(getMsUntilNextSmartGreetingRefresh(new Date(2026, 0, 1, 22, 0, 0))).toBe(7 * 60 * 60 * 1000)
  })
})
