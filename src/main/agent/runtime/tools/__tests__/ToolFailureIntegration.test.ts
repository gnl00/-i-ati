import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ReadArgs, ReadResponse, WriteArgs } from '@shared/tools/fileOperations/index.d'
import type { ToolExecutionResult } from '@main/agent/tools/types'

const state = vi.hoisted(() => ({ workspace: '', calls: 0 }))

vi.mock('electron', () => ({
  app: { getPath: (): string => state.workspace, isReady: (): boolean => false }
}))
vi.mock('@main/db/chat', () => ({
  chatDb: { getWorkspacePathByUuid: (): string => state.workspace }
}))
vi.mock('@main/services/mcpRuntime', () => ({ mcpRuntimeService: {} }))
vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    isRegistered: (name: string): boolean => name === 'read',
    getHandler: (): ((args: ReadArgs) => Promise<ReadResponse>) => async (args: ReadArgs): Promise<ReadResponse> => {
      state.calls += 1
      const { processRead } = await import('@main/tools/fileOperations/FileOperationsProcessor')
      return processRead(args)
    }
  }
}))

import { ToolExecutor } from '@main/agent/tools/ToolExecutor'
import { DefaultToolExecutorDispatcher } from '../ToolExecutorDispatcher'
import { DefaultTranscriptRecordFactory } from '../../transcript/TranscriptRecordFactory'
import { DefaultRequestMaterializer } from '../../transcript/RequestMaterializer'
import type { ToolResultFact } from '../ToolResultFact'

describe('workspace tool failure integration', () => {
  beforeEach(async () => {
    state.workspace = await mkdtemp(join(tmpdir(), 'ati-failure-integration-'))
    state.calls = 0
  })

  afterEach(async () => {
    await rm(state.workspace, { recursive: true, force: true })
  })

  async function dispatchRead(path: string): Promise<ToolResultFact> {
    const executor = new ToolExecutor({ chatUuid: 'integration', workspaceRoot: state.workspace })
    const dispatcher = new DefaultToolExecutorDispatcher({
      runtimeClock: { now: (): number => 123 },
      executeToolCalls: (calls): Promise<ToolExecutionResult[]> => executor.execute(calls)
    })
    const outcome = await dispatcher.dispatch({
      batchId: 'batch', stepId: 'step', createdAt: 1,
      calls: [{
        toolCallId: 'read-1', stepId: 'step', index: 0, name: 'read',
        arguments: JSON.stringify({ file_path: path }),
        confirmationPolicy: { mode: 'not_required' }, status: 'pending'
      }]
    })
    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') throw new Error('Expected completed tool dispatch')
    expect(state.calls).toBe(1)
    return outcome.results[0]
  }

  it('reads an in-workspace absolute path using the real processor', async () => {
    await writeFile(join(state.workspace, 'file.txt'), 'content')
    const result = await dispatchRead(join(state.workspace, 'file.txt'))
    expect(result.status).toBe('success')
    expect(result.failure).toBeUndefined()
    expect(result.content).toMatchObject({ success: true, file_path: 'file.txt', content: 'content' })
  })

  it('rejects missing write content before creating directories and accepts empty content', async () => {
    const { processWrite } = await import('@main/tools/fileOperations/FileOperationsProcessor')
    const args = { chat_uuid: 'integration', file_path: 'new/file.txt' }
    const failure = await processWrite(args as WriteArgs)
    expect(failure.failure).toMatchObject({ category: 'input', code: 'FILE_CONTENT_INVALID' })
    await expect(access(join(state.workspace, 'new'))).rejects.toMatchObject({ code: 'ENOENT' })
    const success = await processWrite({ ...args, content: '' })
    expect(success.success).toBe(true)
  })

  it.each([
    ['missing', 'operation', 'FILE_NOT_FOUND'],
    ['outside', 'policy', 'PATH_OUTSIDE_WORKSPACE']
  ])('preserves %s failure through transcript into the next model request', async (kind, category, code) => {
    const path = kind === 'missing' ? join(state.workspace, 'missing.txt') : `${state.workspace}-outside/file.txt`
    const result = await dispatchRead(path)
    expect(result.status).toBe('success')
    expect(result.content).toMatchObject({ success: false })
    expect(result.failure).toMatchObject({ category, code })
    const record = new DefaultTranscriptRecordFactory().createToolResult({
      recordId: 'record', timestamp: 123, result
    })
    const request = new DefaultRequestMaterializer().materialize({
      transcript: { transcriptId: 'transcript', createdAt: 1, updatedAt: 123, records: [record] },
      requestSpec: { adapterPluginId: 'stub', baseUrl: 'https://example.invalid', apiKey: '', model: 'stub' }
    })
    const content = request.messages.find(message => message.role === 'tool')?.content
    expect(content).toContain(code)
    expect(content).toContain(category)
    expect(content).toContain(result.failure!.recovery.action)
  })
})
