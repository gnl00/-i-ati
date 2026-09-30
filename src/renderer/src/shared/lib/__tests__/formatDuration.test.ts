import { describe, expect, it } from 'vitest'
import { formatDuration } from '../formatDuration'

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [-1, '0s'],
    [59.9, '59s'],
    [60, '1m'],
    [61, '1m1s'],
    [225, '3m45s'],
    [240, '4m'],
    [3600, '60m']
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})
