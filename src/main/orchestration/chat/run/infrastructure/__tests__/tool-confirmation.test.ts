import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolConfirmationManager } from '../tool-confirmation'
import type { ToolConfirmation } from '@shared/tools/confirmation'
import type { RunEventEmitter } from '@main/agent/contracts'

function setup(): {
  manager: ToolConfirmationManager
  emit: ReturnType<typeof vi.fn>
  emitter: RunEventEmitter
  request: { toolCallId: string; name: string; args: { command: string }; agent: { kind: 'subagent'; subagentId: string } }
  promise: Promise<{ approved: boolean; reason?: string; args?: unknown }>
  descriptor: ToolConfirmation
} {
  const manager = new ToolConfirmationManager()
  const emit = vi.fn()
  const emitter = { submissionId: 'run-1', chatUuid: 'chat-1', emit } as unknown as RunEventEmitter
  const request = { toolCallId: 'tool-1', name: 'exec', args: { command: 'echo test' }, agent: { kind: 'subagent' as const, subagentId: 'sub-1' } }
  const promise = manager.request(emitter, request, { peerId: '123', threadId: '9' })
  const descriptor = manager.snapshot('chat-1').confirmations[0]
  return { manager, emit, emitter, request, promise, descriptor }
}

afterEach(() => vi.useRealTimers())

describe('ToolConfirmationManager', () => {
  it('keeps a terminal projection when a synchronous run sink settles the required event', async () => {
    const manager = new ToolConfirmationManager()
    const projection = vi.fn()
    manager.subscribe(projection)
    const emitter: RunEventEmitter = {
      submissionId: 'run', chatUuid: 'chat', setChatMeta: vi.fn(),
      emit(type, payload) {
        if (type === 'tool.confirmation.required') manager.submit({ ...payload, approved: true }, { host: 'chat' })
      }
    }
    await expect(manager.request(emitter, { toolCallId: 'tool', name: 'exec' }, { peerId: '123' })).resolves.toEqual({ approved: true })
    expect(projection).toHaveBeenCalledTimes(1)
    expect(projection.mock.calls[0][0].status).toBe('approved')
  })

  it('publishes desktop approvals to frozen targets and settles every projection from either bound peer', async () => {
    const manager = new ToolConfirmationManager()
    const projection = vi.fn()
    const unsubscribe = manager.subscribe(projection)
    const targets = [{ peerId: '123', threadId: '9' }, { peerId: '456' }]
    const promise = manager.request({ submissionId: 'run', chatUuid: 'chat', emit: vi.fn(), setChatMeta: vi.fn() }, { toolCallId: 'tool', name: 'exec' }, targets)
    const descriptor = manager.snapshot('chat').confirmations[0]
    targets[0].peerId = 'untrusted'
    expect(manager.submitTelegram(descriptor.confirmationId, { approved: true }, { host: 'telegram', peerId: 'untrusted', threadId: '9' })).toMatchObject({ ok: false, reason: 'identity_mismatch' })
    expect(manager.submitTelegram(descriptor.confirmationId, { approved: true }, { host: 'telegram', peerId: '456' }).ok).toBe(true)
    await expect(promise).resolves.toEqual({ approved: true })
    expect(projection.mock.calls.map(([record]) => record.status)).toEqual(['pending', 'approved'])
    expect(projection.mock.calls[1][1]).toEqual([{ peerId: '123', threadId: '9' }, { peerId: '456' }])
    unsubscribe()
    const next = manager.request({ submissionId: 'next', chatUuid: 'chat', emit: vi.fn(), setChatMeta: vi.fn() }, { toolCallId: 'next', name: 'exec' })
    manager.cancelForSubmission('next')
    await next
    expect(projection).toHaveBeenCalledTimes(2)
  })

  it('publishes a versioned descriptor and resolves before resuming execution', async () => {
    const { manager, emit, promise, descriptor } = setup()
    const order: string[] = []
    emit.mockImplementation(type => order.push(type))
    const continued = promise.then(decision => { order.push('execute'); return decision })
    const result = manager.submit({ ...descriptor, approved: true, args: { command: 'echo approved' } }, { host: 'chat' })
    expect(result).toMatchObject({ ok: true, confirmation: { status: 'approved', resolvedBy: { host: 'chat' }, version: descriptor.version + 1 } })
    expect(await continued).toEqual({ approved: true, args: { command: 'echo approved' } })
    expect(order).toEqual(['tool.confirmation.resolved', 'execute'])
    expect(descriptor).toMatchObject({ status: 'pending', agent: { subagentId: 'sub-1' } })
  })

  it('reuses a pending request but gives another round a fresh identity', async () => {
    const { manager, emitter, request, promise, descriptor } = setup()
    expect(manager.request(emitter, request)).toBe(promise)
    manager.submit({ ...descriptor, approved: false }, { host: 'chat' })
    await promise
    const next = manager.request(emitter, request)
    const latest = manager.snapshot('chat-1').confirmations.at(-1)!
    expect(latest.confirmationId).not.toBe(descriptor.confirmationId)
    expect(manager.submit({ ...descriptor, approved: true }, { host: 'chat' })).toMatchObject({ ok: false, reason: 'already_resolved', confirmation: { status: 'denied' } })
    manager.cancelForSubmission('run-1')
    await next
  })

  it('accepts only the first cross-host decision and returns the actual winner', async () => {
    const { manager, emit, promise, descriptor } = setup()
    const first = manager.submitTelegram(descriptor.confirmationId, { approved: true }, { host: 'telegram', peerId: '123', threadId: '9', userId: 'user' })
    const second = manager.submit({ ...descriptor, approved: false }, { host: 'tui' })
    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, reason: 'already_resolved', confirmation: { status: 'approved', resolvedBy: { host: 'telegram' } } })
    expect(emit.mock.calls.filter(([type]) => type === 'tool.confirmation.resolved')).toHaveLength(1)
    await expect(promise).resolves.toEqual({ approved: true })
  })

  it.each(['submissionId', 'chatUuid', 'toolCallId'])('validates %s without settling the pending request', async key => {
    const { manager, promise, descriptor } = setup()
    expect(manager.submit({ ...descriptor, [key]: 'wrong', approved: true }, { host: 'chat' })).toEqual({ ok: false, reason: 'identity_mismatch' })
    expect(manager.snapshot('chat-1').confirmations[0].status).toBe('pending')
    manager.cancelForSubmission('run-1')
    await promise
  })

  it('rejects malformed requests and callbacks from another peer or topic', async () => {
    const { manager, promise, descriptor } = setup()
    for (const raw of [null, [], {}, { ...descriptor, approved: 'yes' }, { ...descriptor, approved: true, reason: 1 }]) {
      expect(manager.submit(raw, { host: 'chat' })).toEqual({ ok: false, reason: 'invalid_request' })
    }
    for (const target of [{ peerId: '456', threadId: '9' }, { peerId: '123', threadId: '8' }]) {
      expect(manager.submitTelegram(descriptor.confirmationId, { approved: true }, { host: 'telegram', ...target })).toEqual({ ok: false, reason: 'identity_mismatch' })
    }
    expect(manager.submitTelegram('obsolete-id', { approved: true }, { host: 'telegram', peerId: '123' })).toEqual({ ok: false, reason: 'not_found' })
    manager.cancelForSubmission('run-1')
    await promise
  })

  it('publishes expiration without needing an execution event', async () => {
    vi.useFakeTimers()
    const { manager, emit, promise, descriptor } = setup()
    vi.advanceTimersByTime(5 * 60 * 1000)
    await expect(promise).resolves.toEqual({ approved: false, reason: 'timeout' })
    expect(emit).toHaveBeenLastCalledWith('tool.confirmation.resolved', expect.objectContaining({ status: 'expired', confirmationId: descriptor.confirmationId, resolvedBy: { host: 'system', cause: 'timeout' } }))
    expect(manager.submit({ ...descriptor, approved: true }, { host: 'chat' })).toMatchObject({ ok: false, confirmation: { status: 'expired' } })
  })

  it('checks the deadline even before the timer callback runs', async () => {
    vi.useFakeTimers()
    const { manager, promise, descriptor } = setup()
    vi.setSystemTime(descriptor.expiresAt)
    expect(manager.submit({ ...descriptor, approved: true }, { host: 'chat' })).toMatchObject({ ok: false, confirmation: { status: 'expired' } })
    await expect(promise).resolves.toEqual({ approved: false, reason: 'timeout' })
  })

  it('cancels only the requested run and publishes auto approval', async () => {
    const { manager, promise, descriptor } = setup()
    const other = manager.request({ submissionId: 'run-2', chatUuid: 'chat-2', emit: vi.fn() } as unknown as RunEventEmitter, { toolCallId: 'tool-1', name: 'exec' })
    manager.cancelForSubmission('run-1', 'user_cancelled')
    await expect(promise).resolves.toEqual({ approved: false, reason: 'user_cancelled' })
    expect(manager.snapshot('chat-1').confirmations[0]).toMatchObject({ confirmationId: descriptor.confirmationId, status: 'cancelled' })
    expect(manager.snapshot('chat-2').confirmations[0].status).toBe('pending')
    manager.approvePendingForSubmission('run-2')
    await expect(other).resolves.toMatchObject({ approved: true })
    expect(manager.snapshot('chat-2').confirmations[0]).toMatchObject({ status: 'approved', resolvedBy: { host: 'system', cause: 'auto' } })
  })

  it('bounds terminal history while preserving pending items', async () => {
    const { manager, emitter, promise, descriptor } = setup()
    for (let i = 0; i < 501; i++) {
      const next = manager.request(emitter, { toolCallId: `other-${i}`, name: 'exec' })
      const record = manager.snapshot('chat-1').confirmations.at(-1) as ToolConfirmation
      manager.submit({ ...record, approved: false }, { host: 'chat' })
      await next
    }
    expect(manager.snapshot('chat-1').confirmations).toHaveLength(501)
    expect(manager.snapshot('chat-1').confirmations.find(item => item.confirmationId === descriptor.confirmationId)?.status).toBe('pending')
    manager.cancelForSubmission('run-1')
    await promise
  })
})
