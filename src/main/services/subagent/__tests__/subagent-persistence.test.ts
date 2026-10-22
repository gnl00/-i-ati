import { describe, expect, it, vi } from 'vitest'
import { SubagentRunService } from '../subagent-run-service'
import { SubagentRegistry } from '../subagent-registry'
import type { subagentDb } from '@main/db/subagents'
import type { StoredSubagentRun } from '@main/db/repositories/SubagentRepository'
import type { SubagentSpawnInput } from '../types'

vi.mock('electron', () => ({ app: { isReady: (): boolean => false, getPath: (): string => '/tmp' } }))

const input: SubagentSpawnInput = { task: 'inspect', role: 'researcher', contextMode: 'minimal', files: [], chatUuid: 'chat', parentSubmissionId: 'parent', workspacePath: '/tmp', modelRef: { accountId: 'account', modelId: 'model' } }
const memoryStore = (): typeof subagentDb => {
  const runs = new Map<string, StoredSubagentRun>()
  return {
    save: (run): void => { runs.set(run.record.id, structuredClone(run)) },
    get: (id, runId): StoredSubagentRun | null => {
      const run = runs.get(id)
      return run && (!runId || run.record.run_id === runId) ? structuredClone(run) : null
    },
    list: (chatUuid) => [...runs.values()].filter(run => run.record.parent_chat_uuid === chatUuid).map(run => structuredClone(run.record)),
    recoverInterrupted: (): void => {}
  }
}

describe('subagent persistence boundary', () => {
  it('separates identities, saves evidence and supports readers with empty runtime memory', async () => {
    const store = memoryStore()
    const service = new SubagentRunService(new SubagentRegistry(), { run: vi.fn(async () => ({
      status: 'completed' as const, summary: 'evidence', artifacts: { tools_used: ['read'], files_touched: [] },
      transcript: { transcriptId: 'trace', createdAt: 1, updatedAt: 2, records: [] }
    })) }, store)
    const spawned = await service.spawn(input)
    expect(spawned.run_id).not.toBe(spawned.id)
    expect(spawned.result_ref).toBe(spawned.run_id)
    expect((await service.wait(spawned.id, 100))?.status).toBe('completed')
    const reader = new SubagentRunService(new SubagentRegistry(), undefined, store)
    expect((await reader.wait(spawned.id, 100))?.summary).toBe('evidence')
    expect(reader.list('chat')).toHaveLength(1)
    expect(reader.inspect(spawned.id, spawned.run_id)?.transcriptJson).toContain('trace')
    expect(reader.inspect(spawned.id, 'another-run')).toBeNull()
    expect(reader.inspect(spawned.id)?.inputJson).not.toContain('signal')
  })

  it('does not dispatch when initial persistence fails and exposes later storage failures', async () => {
    const store = memoryStore()
    const save = vi.spyOn(store, 'save')
    const run = vi.fn(async () => ({ status: 'completed' as const, summary: 'done', artifacts: { tools_used: [], files_touched: [] } }))
    const service = new SubagentRunService(new SubagentRegistry(), { run }, store)
    save.mockImplementationOnce(() => { throw new Error('disk full') })
    await expect(service.spawn(input)).rejects.toThrow('disk full')
    expect(run).not.toHaveBeenCalled()
    save.mockImplementationOnce(() => {})
    save.mockImplementation(() => { throw new Error('storage unavailable') })
    const spawned = await service.spawn(input)
    const completed = await service.wait(spawned.id, 100)
    expect(completed).toMatchObject({ status: 'completed', persistence_error: 'Error: storage unavailable' })
  })
})
