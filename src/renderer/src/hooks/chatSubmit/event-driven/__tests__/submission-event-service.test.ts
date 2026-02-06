import { describe, expect, it, vi } from 'vitest'
import { SubmissionEventService } from '../submission-event-service'

describe('SubmissionEventService', () => {
  it('marks one-time events by submission id', () => {
    const service = new SubmissionEventService()
    expect(service.markOnce('submission.completed', 's1')).toBe(true)
    expect(service.markOnce('submission.completed', 's1')).toBe(false)
    expect(service.markOnce('submission.completed', 's2')).toBe(true)
  })

  it('deduplicates stream chunks by sequence per submission', () => {
    const service = new SubmissionEventService()
    expect(service.shouldProcessEvent({ type: 'stream.chunk', sequence: 1, submissionId: 's1' } as any)).toBe(true)
    expect(service.shouldProcessEvent({ type: 'stream.chunk', sequence: 1, submissionId: 's1' } as any)).toBe(false)
    expect(service.shouldProcessEvent({ type: 'stream.chunk', sequence: 2, submissionId: 's1' } as any)).toBe(true)
    expect(service.shouldProcessEvent({ type: 'stream.chunk', sequence: 1, submissionId: 's2' } as any)).toBe(true)
  })

  it('replaces active subscription for same submission id', () => {
    const service = new SubmissionEventService()
    const unsub1 = vi.fn()
    const unsub2 = vi.fn()

    service.replaceActiveSubscription('s1', unsub1)
    service.replaceActiveSubscription('s1', unsub2)

    expect(unsub1).toHaveBeenCalledTimes(1)
    expect(unsub2).toHaveBeenCalledTimes(0)

    service.clearActiveSubscription('s1', unsub2)
    service.replaceActiveSubscription('s1', unsub1)
    expect(unsub2).toHaveBeenCalledTimes(0)
  })
})
