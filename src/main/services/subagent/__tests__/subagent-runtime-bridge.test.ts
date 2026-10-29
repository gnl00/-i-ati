import { describe, expect, it, vi } from 'vitest'
import { ToolConfirmationManager } from '@main/orchestration/chat/run/infrastructure/tool-confirmation'
import type { SubagentRecord } from '@tools/subagent/index.d'
import type { ToolConfirmationRequest } from '@shared/tools/confirmation'
import type { AgentRequestSpec } from '@main/agent/contracts/HostRuntimeContracts'
import type { RunEventEmitter } from '@main/agent/contracts'
import { subagentRuntimeBridge } from '../subagent-runtime-bridge'

// Exercise the real bridge and confirmation manager, including parent completion.
describe('subagent runtime bridge', () => {
  it('retains the channel beyond parent completion and cancels only one child approval', async () => {
    const manager = new ToolConfirmationManager()
    const emitter = { submissionId: 'bridge-parent', chatUuid: 'chat', setChatMeta: vi.fn(), emit: vi.fn() } as RunEventEmitter
    subagentRuntimeBridge.register(emitter.submissionId, {
      emitter,
      requester: { request: request => manager.request(emitter, request) },
      cancelConfirmation: id => manager.cancelForSubagent(emitter.submissionId, id)
    })
    const releaseA = subagentRuntimeBridge.retain(emitter.submissionId)
    const releaseB = subagentRuntimeBridge.retain(emitter.submissionId)
    subagentRuntimeBridge.releaseParent(emitter.submissionId)
    const controller = new AbortController()
    const request = (id: string): ToolConfirmationRequest => ({ name: 'exec', toolCallId: 'same-tool-id', agent: { kind: 'subagent' as const, subagentId: id } })
    const a = subagentRuntimeBridge.request(emitter.submissionId, request('a'), controller.signal)
    const b = subagentRuntimeBridge.request(emitter.submissionId, request('b'))
    manager.cancelForSubmission(emitter.submissionId, 'parent_finished', false)
    expect(manager.snapshot('chat').confirmations.map(item => item.status)).toEqual(['pending', 'pending'])
    controller.abort()
    await expect(a).resolves.toMatchObject({ approved: false, reason: 'user_cancelled' })
    const other = manager.snapshot('chat').confirmations.find(item => item.agent?.subagentId === 'b')!
    expect(other.status).toBe('pending')
    manager.submit({ ...other, approved: true }, { host: 'chat' })
    await expect(b).resolves.toEqual({ approved: true })
    releaseA()
    subagentRuntimeBridge.emitSubagentUpdated(emitter.submissionId, { id: 'b', task: 'inspect', role: 'reviewer', status: 'completed', created_at: 1 } satisfies SubagentRecord)
    expect(emitter.emit).toHaveBeenLastCalledWith('subagent.updated', { subagent: expect.objectContaining({ id: 'b' }) })
    releaseB()
    await expect(subagentRuntimeBridge.request(emitter.submissionId, request('c'))).resolves.toMatchObject({ approved: false, reason: 'parent confirmation channel unavailable' })
  })
})

it('binds the prepared CLI-only model to the existing supervised parent channel', () => {
  const id = 'cli-prepared-model'
  const modelRef = { accountId: 'cli', modelId: 'external' }
  const requestSpec: AgentRequestSpec = {
    adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost',
    apiKey: 'test', model: 'external'
  }
  subagentRuntimeBridge.register(id, {
    emitter: { submissionId: id, setChatMeta: vi.fn(), emit: vi.fn() },
    requester: { request: async (): Promise<{ approved: boolean }> => ({ approved: false }) },
    cancelConfirmation: vi.fn()
  })
  subagentRuntimeBridge.setRequestSpec(id, modelRef, requestSpec)
  expect(subagentRuntimeBridge.getRequestSpec(id, modelRef)).toBe(requestSpec)
  expect(subagentRuntimeBridge.getRequestSpec(id, { ...modelRef, modelId: 'other' })).toBeUndefined()
  subagentRuntimeBridge.releaseParent(id)
  expect(subagentRuntimeBridge.getRequestSpec(id, modelRef)).toBeUndefined()
})
