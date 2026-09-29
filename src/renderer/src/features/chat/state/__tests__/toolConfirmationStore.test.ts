import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolConfirmation, ToolConfirmationSnapshot } from '@shared/tools/confirmation'
const ipc = vi.hoisted(() => ({ submit: vi.fn(), snapshot: vi.fn() }))
vi.mock('@renderer/infrastructure/ipc', () => ({ invokeRunToolConfirm: ipc.submit, invokeToolConfirmationSnapshot: ipc.snapshot }))
import { useToolConfirmationStore } from '../toolConfirmationStore'

const pending = (patch: Partial<ToolConfirmation> = {}): ToolConfirmation => ({
  confirmationId: 'approval', submissionId: 'run', chatUuid: 'chat', toolCallId: 'tool', name: 'exec',
  status: 'pending', version: 1, createdAt: 1, expiresAt: 300001, ...patch
})
const store = (): ReturnType<typeof useToolConfirmationStore.getState> => useToolConfirmationStore.getState()
beforeEach(() => {
  ipc.submit.mockReset()
  ipc.snapshot.mockReset()
  store().activate('chat')
})

describe('versioned approval projection', () => {
  it('ends approval from another host immediately, before execution starts', () => {
    store().apply(pending())
    expect(store().pendingRequests).toHaveLength(1)
    store().apply(pending({ status: 'approved', version: 2, resolvedBy: { host: 'telegram', peerId: '123' } }))
    expect(store().pendingRequests).toEqual([])
    expect(store().confirmations.approval.status).toBe('approved')
    store().apply(pending())
    expect(store().pendingRequests).toEqual([])
  })

  it('reconciles terminal events arriving while an older snapshot is in flight', async () => {
    let resolve!: (snapshot: ToolConfirmationSnapshot) => void
    ipc.snapshot.mockReturnValue(new Promise(done => { resolve = done }))
    const hydration = store().hydrate('chat')
    store().apply(pending({ status: 'denied', version: 2 }))
    resolve({ version: 1, confirmations: [pending()] })
    await hydration
    expect(store().pendingRequests).toEqual([])
    expect(store().confirmations.approval.status).toBe('denied')
  })

  it('restores pending approvals and rejects late events older than the snapshot', async () => {
    ipc.snapshot.mockResolvedValue({ version: 5, confirmations: [pending({ version: 4 })] })
    await store().hydrate('chat')
    expect(store().pendingRequests).toHaveLength(1)
    store().apply(pending({ confirmationId: 'obsolete', version: 2 }))
    expect(store().pendingRequests.map(item => item.confirmationId)).toEqual(['approval'])
  })

  it('ignores stale hydration even after switching away and back to the same chat', async () => {
    let resolve!: (snapshot: ToolConfirmationSnapshot) => void
    ipc.snapshot.mockReturnValue(new Promise(done => { resolve = done }))
    const hydration = store().hydrate('chat')
    store().activate('other')
    store().activate('chat')
    store().apply(pending({ confirmationId: 'current', version: 4 }))
    resolve({ version: 1, confirmations: [pending()] })
    await hydration
    expect(store().pendingRequests.map(item => item.confirmationId)).toEqual(['current'])
  })

  it('submits the full identity and uses the Main result when another host won', async () => {
    store().apply(pending())
    ipc.submit.mockResolvedValue({ ok: false, reason: 'already_resolved', confirmation: pending({ status: 'approved', version: 2 }) })
    await store().cancel('deny', 'approval')
    expect(ipc.submit).toHaveBeenCalledWith({ confirmationId: 'approval', submissionId: 'run', chatUuid: 'chat', toolCallId: 'tool', approved: false, reason: 'deny' })
    expect(store().pendingRequests).toEqual([])
    expect(store().confirmations.approval.status).toBe('approved')
  })

  it('keeps a pending card on transport failure and reconciles a missing request', async () => {
    store().apply(pending())
    ipc.submit.mockRejectedValueOnce(new Error('disconnected'))
    await expect(store().confirm('approval')).rejects.toThrow('disconnected')
    expect(store().pendingRequests).toHaveLength(1)
    ipc.submit.mockResolvedValue({ ok: false, reason: 'not_found' })
    ipc.snapshot.mockResolvedValue({ version: 2, confirmations: [] })
    await expect(store().confirm('approval')).rejects.toThrow('not_found')
    expect(store().pendingRequests).toEqual([])
  })

  it('does not clear a new round when an older approval response arrives', async () => {
    store().apply(pending())
    let resolve!: (result: unknown) => void
    ipc.submit.mockReturnValue(new Promise(done => { resolve = done }))
    const submission = store().confirm('approval')
    store().apply(pending({ confirmationId: 'round-2', version: 3 }))
    resolve({ ok: true, confirmation: pending({ status: 'approved', version: 2 }) })
    await submission
    expect(store().pendingRequests.map(item => item.confirmationId)).toEqual(['round-2'])
    store().apply(pending({ chatUuid: 'other', confirmationId: 'foreign', version: 4 }))
    expect(store().pendingRequests).toHaveLength(1)
  })
})
