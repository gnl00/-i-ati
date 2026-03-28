import { describe, expect, it, vi } from 'vitest'
import { DuplicateSubmissionIdError } from '../errors'
import { RunRegistry } from '../RunRegistry'

describe('RunRegistry', () => {
  it('stores and retrieves runs by submission id', () => {
    const registry = new RunRegistry()
    const run = { cancel: vi.fn() } as any

    registry.add('submission-1', run)

    expect(registry.get('submission-1')).toBe(run)
  })

  it('rejects duplicate submission ids', () => {
    const registry = new RunRegistry()
    const run = { cancel: vi.fn() } as any

    registry.add('submission-1', run)

    expect(() => registry.add('submission-1', run)).toThrow(DuplicateSubmissionIdError)
  })

  it('deletes runs', () => {
    const registry = new RunRegistry()
    const run = { cancel: vi.fn() } as any

    registry.add('submission-1', run)
    registry.delete('submission-1')

    expect(registry.get('submission-1')).toBeUndefined()
  })
})
