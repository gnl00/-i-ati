import { describe, expect, it } from 'vitest'
import { formatLocalIsoTimestamp, localIsoPinoTimestamp } from '../time'

describe('logging time helpers', () => {
  it('formats local timestamps with timezone offset', () => {
    const value = formatLocalIsoTimestamp(new Date('2026-03-22T12:40:18.123Z'))

    expect(value).toMatch(/2026-03-22T\d{2}:\d{2}:\d{2}\.123[+-]\d{2}:\d{2}$/)
    expect(value.endsWith('Z')).toBe(false)
  })

  it('builds pino timestamp fragment with local iso time', () => {
    const fragment = localIsoPinoTimestamp()

    expect(fragment).toMatch(/^,"time":"\d{4}-\d{2}-\d{2}T/)
    expect(fragment.endsWith('"')).toBe(true)
  })
})
