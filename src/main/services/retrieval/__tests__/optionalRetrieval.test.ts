import { describe, expect, it } from 'vitest'
import { optionalRetrieval } from '../optionalRetrieval'

describe('optional retrieval', () => {
  it('preserves run cancellation and does not start already cancelled work', async () => {
    const controller = new AbortController()
    controller.abort()
    let calls = 0
    await expect(optionalRetrieval(async () => { calls++; return [] }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toBe(0)
  })

  it('bounds a stalled provider while preserving ordinary successful results', async () => {
    expect(await optionalRetrieval(async () => [1])).toEqual([1])
    const start = Date.now()
    expect(await optionalRetrieval(() => new Promise<never[]>(() => {}))).toEqual([])
    expect(Date.now() - start).toBeLessThan(4500)
  })
})
