import { describe, expect, it, vi } from 'vitest'
import { SubagentRunService } from '../subagent-run-service'
import { SubagentRegistry } from '../subagent-registry'
import type { subagentDb, subagentMessageDb } from '@main/db/subagents'
import type { StoredSubagentRun, SubagentMessage } from '@main/db/repositories/SubagentRepository'
import type { SubagentExecutionResult, SubagentSpawnInput } from '../types'

vi.mock('electron', () => ({ app: { isReady: (): boolean => false, getPath: (): string => '/tmp' } }))

function storage(): { runs: typeof subagentDb; messages: typeof subagentMessageDb } {
  const runs = new Map<string, StoredSubagentRun>()
  const messages = new Map<string, SubagentMessage>()
  const mail: typeof subagentMessageDb = {
    send(input) {
      const old = messages.get(input.id)
      if (old && (old.body !== input.body || old.childId !== input.childId || old.mode !== input.mode)) throw new Error('Message conflict')
      if (!old && input.mode === 'message' && [...messages.values()].filter(message => message.childId === input.childId && message.mode === 'message' && message.status === 'pending').length >= 16) throw new Error('Subagent inbox is full.')
      if (!old) messages.set(input.id, { ...input, status: 'pending' })
      return messages.get(input.id)!
    },
    get: id => messages.get(id) ?? null,
    pending: child => [...messages.values()].filter(message => message.childId === child && message.status === 'pending'),
    deliver(id, runId) { const message = messages.get(id)!; if (message.status === 'pending') Object.assign(message, { status: 'delivered', runId }) },
    acknowledge(id, runId) { const message = messages.get(id)!; if (message.runId === runId) message.status = 'consumed' },
    forRun: runId => [...messages.values()].filter(message => message.runId === runId)
  }
  return {
    messages: mail,
    runs: {
      save(run): void {
        runs.set(run.record.run_id!, structuredClone(run))
        const input = JSON.parse(run.inputJson) as SubagentSpawnInput
        if (run.record.status === 'queued') for (const id of [input.requestMessageId, ...(input.initialMessageIds ?? [])]) if (id) mail.deliver(id, run.record.run_id!)
      },
      get: (child, runId) => [...runs.values()].reverse().find(run => run.record.id === child && (!runId || run.record.run_id === runId)) ?? null,
      list: chat => [...runs.values()].filter(run => run.record.parent_chat_uuid === chat).map(run => run.record),
      recoverInterrupted: (): void => {}
    }
  }
}
const input: SubagentSpawnInput = { task: 'investigate', role: 'coder', contextMode: 'minimal', files: [], workspacePath: '/tmp', chatUuid: 'chat', permissionApprovalMode: 'auto', modelRef: { accountId: 'a', modelId: 'm' } }
const result: SubagentExecutionResult = { status: 'completed', summary: 'evidence', artifacts: { tools_used: ['read'], files_touched: [] }, transcript: {
  transcriptId: 'trace', createdAt: 1, updatedAt: 2, records: [{ recordId: 'old-goal', kind: 'user', timestamp: 1, content: [{ type: 'input_text', text: 'original task' }] }]
} }

function setup(): { service: SubagentRunService; pending: Array<{ input: SubagentSpawnInput; resolve: (result: SubagentExecutionResult) => void }>; store: ReturnType<typeof storage> } {
  const pending: Array<{ input: SubagentSpawnInput; resolve: (result: SubagentExecutionResult) => void }> = []
  const store = storage()
  const service = new SubagentRunService(new SubagentRegistry(), { run: (runInput): Promise<SubagentExecutionResult> => new Promise(resolve => pending.push({ input: runInput, resolve })) }, store.runs, store.messages)
  return { service, pending, store }
}

describe('persistent child continuation', () => {
  it('admits an explicit followup when all informational inbox slots are full', async () => {
    const { service, pending } = setup()
    const child = await service.spawn(input)
    pending[0].resolve(result)
    await service.wait(child.id, 100)
    for (let i = 0; i < 16; i++) service.sendMessage(child.id, `info-${i}`, `Information ${i}.`, 'chat')
    expect(() => service.sendMessage(child.id, 'overflow', 'Too much information.', 'chat')).toThrow('full')
    const continued = await service.followup(child.id, 'continue-full-inbox', 'Review all pending information.', 'parent')
    expect(continued.id).toBe(child.id)
    expect(pending[1].input.task).toContain('Information 15.')
    expect(pending[1].input.initialMessageIds).toHaveLength(16)
    pending[1].resolve(result)
    await service.wait(child.id, 100)
  })

  it('observes another host latest run and continues from its revision instead of a stale local cache', async () => {
    const { service, pending, store } = setup()
    const child = await service.spawn(input)
    pending[0].resolve(result)
    await service.wait(child.id, 100)
    const other = new SubagentRunService(new SubagentRegistry(), { run: async (): Promise<SubagentExecutionResult> => result }, store.runs, store.messages)
    const next = await other.followup(child.id, 'other-host', 'Second host task.', 'parent-2')
    const completed = await other.wait(child.id, 100)
    expect(service.get(child.id)).toEqual(completed)
    expect(service.list('chat').find(record => record.id === child.id)).toEqual(completed)
    expect(await service.wait(child.id, 100)).toEqual(completed)
    const third = await service.followup(child.id, 'original-host', 'Third task.', 'parent-3')
    expect(third.revision).toBeGreaterThan(completed!.revision!)
    expect(third.run_id).not.toBe(next.run_id)
    pending[1].resolve(result)
    await service.wait(child.id, 100)
  })

  it('delivers running-child messages once at a safe checkpoint and leaves idle messages pending', async () => {
    const { service, pending, store } = setup()
    const child = await service.spawn(input)
    service.sendMessage(child.id, 'message-1', 'Check the failure case.', 'chat')
    const source = pending[0].input.steeringMessageSource!
    const delivered = source.take()!
    expect(delivered.text).toBe('Check the failure case.')
    expect(source.take()).toBeUndefined()
    source.acknowledge(delivered.queueItemId)
    expect(service.sendMessage(child.id, 'message-1', 'Check the failure case.', 'chat').status).toBe('consumed')
    expect(() => service.sendMessage(child.id, 'message-1', 'Different content', 'chat')).toThrow()
    pending[0].resolve(result)
    await service.wait(child.id, 100)
    const idle = service.sendMessage(child.id, 'idle-message', 'New information.', 'chat')
    expect(pending).toHaveLength(1)
    expect(store.messages.get(idle.id)?.status).toBe('pending')
  })

  it('continues the same child with a distinct run, history, fresh policy and idempotent task receipt', async () => {
    const { service, pending } = setup()
    const child = await service.spawn(input)
    await expect(service.followup(child.id, 'busy', 'work')).rejects.toThrow('busy')
    pending[0].resolve(result)
    await service.wait(child.id, 100)
    service.sendMessage(child.id, 'idle-context', 'Preserve the user changes.', 'chat')
    const next = await service.followup(child.id, 'task-2', 'Apply the fix.', 'parent-2', 'manual')
    expect(next.id).toBe(child.id)
    expect(next.run_id).not.toBe(child.run_id)
    expect(next.revision).toBeGreaterThan(child.revision!)
    expect(pending[1].input.history).toEqual(result.transcript!.records)
    expect(pending[1].input.task).toContain('Preserve the user changes.')
    expect(pending[1].input.permissionApprovalMode).toBe('manual')
    expect((await service.followup(child.id, 'task-2', 'Apply the fix.', 'parent-2')).run_id).toBe(next.run_id)
    expect(pending).toHaveLength(2)
    expect(service.cancel(child.id, 'user_cancelled', child.run_id)?.run_id).toBe(child.run_id)
    expect(pending[1].input.signal?.aborted).toBe(false)
    pending[1].resolve(result)
    await service.wait(child.id, 100)
    expect((await service.followup(child.id, 'task-2', 'Apply the fix.', 'parent-2')).run_id).toBe(next.run_id)
    await expect(service.followup(child.id, 'task-2', 'Changed task.', 'parent-2')).rejects.toThrow()
  })

  it('waits for a revision change and returns the captured run even when another run starts', async () => {
    const registry = new SubagentRegistry()
    const first = registry.create({ task: 'first', role: 'general' })
    registry.markRunning(first.id)
    const changed = registry.wait(first.id, 100, undefined, 2)
    registry.markCancelling(first.id)
    expect((await changed)?.status).toBe('cancelling')
    const terminal = registry.wait(first.id, 100)
    registry.markCancelled(first.id, 'stopped')
    registry.create({ id: first.id, task: 'second', role: 'general', revision: 5 })
    expect((await terminal)?.run_id).toBe(first.run_id)
  })
  it('stores run-local transcript records and retains earlier context after a preparation failure', async () => {
    const { service, pending, store } = setup()
    const child = await service.spawn(input)
    pending[0].resolve(result)
    await service.wait(child.id, 100)
    const next = await service.followup(child.id, 'delta-2', 'Second task.', 'parent')
    const added: NonNullable<SubagentExecutionResult['transcript']>['records'][number] = { recordId: 'second-goal', kind: 'user', timestamp: 3, content: [{ type: 'input_text', text: 'second task' }] }
    pending[1].resolve({ ...result, transcript: { ...result.transcript!, records: [...result.transcript!.records, added] } })
    await service.wait(child.id, 100)
    expect(JSON.parse(store.runs.get(child.id, next.run_id)!.transcriptJson!).records).toEqual([added])
    await service.followup(child.id, 'failed-3', 'Unavailable preparation.', 'parent')
    expect(pending[2].input.history).toEqual([...result.transcript!.records, added])
    pending[2].resolve({ ...result, status: 'failed', transcript: undefined, error: 'Model unavailable' })
    await service.wait(child.id, 100)
    await service.followup(child.id, 'retry-4', 'Inspect evidence and continue.', 'parent')
    expect(pending[3].input.history).toEqual([...result.transcript!.records, added])
    pending[3].resolve(result)
    await service.wait(child.id, 100)
  })

})
