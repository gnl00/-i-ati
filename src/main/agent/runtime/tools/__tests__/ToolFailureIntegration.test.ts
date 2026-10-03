import {
  createAssistantContextRecord,
  createToolContextRecord,
  createUserContextRecord
} from '../../context/ContextRecords'
import { ContextManager } from '../../context/ContextManager'
import { DefaultToolResultNormalizer } from '../result-normalization'
import type { EmbeddedToolExecutionContext, EmbeddedToolHandler } from '@shared/tools/registry'
import { createHash } from 'node:crypto'
import { projectContextRequest } from '../../context/ContextRequest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type {
  EditArgs,
  EditResponse,
  ReadArgs,
  ReadResponse,
  WriteArgs
} from '@shared/tools/fileOperations/index.d'
import type { ToolExecutionResult } from '@main/agent/tools/types'

const state = vi.hoisted(() => ({ workspace: '', calls: 0 }))

vi.mock('electron', () => ({
  app: {
    getPath: (): string => state.workspace,
    isReady: (): boolean => false
  }
}))
vi.mock('@main/db/chat', () => ({
  chatDb: { getWorkspacePathByUuid: (): string => state.workspace }
}))
vi.mock('@main/services/mcpRuntime', () => ({ mcpRuntimeService: {} }))
vi.mock('@main/request', () => ({ unifiedChatRequest: vi.fn() }))
vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    getToolMetadata: (): undefined => undefined,
    isRegistered: (name: string): boolean => name === 'read' || name === 'edit',
    getHandler:
      (name: string): EmbeddedToolHandler['handler'] =>
      async (
        args: ReadArgs | EditArgs,
        context?: EmbeddedToolExecutionContext
      ): Promise<ReadResponse | EditResponse> => {
        state.calls += 1
        const { processRead, processEdit, formatReadResultForModel } =
          await import('@main/tools/fileOperations/FileOperationsProcessor')
        if (name === 'edit') return processEdit(args as EditArgs, context)
        const result = await processRead(args as ReadArgs, context)
        if (result.success)
          context?.setModelContent?.(formatReadResultForModel(result), {
            kind: 'text'
          })
        return result
      }
  }
}))

import { ToolExecutor } from '@main/agent/tools/ToolExecutor'
import { DefaultToolExecutorDispatcher } from '../ToolExecutorDispatcher'
import type { ToolResultFact } from '../ToolResultFact'

describe('workspace tool failure integration', () => {
  beforeEach(async () => {
    state.workspace = await mkdtemp(join(tmpdir(), 'ati-failure-integration-'))
    state.calls = 0
  })

  afterEach(async () => {
    await rm(state.workspace, { recursive: true, force: true })
  })

  async function dispatchTool(
    name: 'read' | 'edit',
    args: Record<string, unknown>
  ): Promise<ToolResultFact> {
    const beforeCalls = state.calls
    const callId = `${name}-${beforeCalls + 1}`
    const stepId = `step-${beforeCalls + 1}`
    const executor = new ToolExecutor({
      chatUuid: 'integration',
      workspaceRoot: state.workspace
    })
    const dispatcher = new DefaultToolExecutorDispatcher({
      runtimeClock: { now: (): number => 123 },
      toolResultNormalizer: new DefaultToolResultNormalizer({
        workspaceRoot: state.workspace
      }),
      executeToolCalls: (calls): Promise<ToolExecutionResult[]> => executor.execute(calls)
    })
    const outcome = await dispatcher.dispatch({
      batchId: 'batch',
      stepId,
      createdAt: 1,
      calls: [
        {
          toolCallId: callId,
          stepId,
          index: 0,
          name,
          arguments: JSON.stringify(args),
          confirmationPolicy: { mode: 'not_required' },
          status: 'pending'
        }
      ]
    })
    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') throw new Error('Expected completed tool dispatch')
    expect(state.calls).toBe(beforeCalls + 1)
    return outcome.results[0]
  }

  async function dispatchRead(
    path: string,
    range: Record<string, unknown> = {}
  ): Promise<ToolResultFact> {
    return dispatchTool('read', { file_path: path, ...range })
  }

  it('reads an in-workspace absolute path using the real processor', async () => {
    await writeFile(join(state.workspace, 'file.txt'), 'content')
    const result = await dispatchRead(join(state.workspace, 'file.txt'))
    expect(result.status).toBe('success')
    expect(result.failure).toBeUndefined()
    expect(result.content).toMatchObject({
      success: true,
      file_path: 'file.txt',
      content: 'content'
    })
  })

  it('preserves continuous literal Read pages and stale failures through normalization and ContextManager', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='
    const source = `const image = "data:image/png;base64,${png}"\n` + '"\\🙂'.repeat(9_000)
    const filePath = join(state.workspace, 'large.txt')
    await writeFile(filePath, source)
    const version = `sha256:${createHash('sha256').update(source).digest('hex')}`
    const manager = new ContextManager(
      [
        createUserContextRecord({
          recordId: 'user',
          timestamp: 1,
          content: [
            {
              type: 'input_text',
              text: 'Inspect the complete file, then edit it.'
            }
          ]
        })
      ],
      {
        adapterPluginId: 'stub',
        baseUrl: 'https://example.invalid',
        apiKey: '',
        model: 'stub',
        contextWindowTokens: 1_000_000,
        contextCompression: false
      },
      { id: 'integration', timestamp: 1 }
    )

    const appendResult = (result: ToolResultFact, args: Record<string, unknown>): void => {
      manager.append(
        [
          createAssistantContextRecord({
            recordId: result.stepId,
            timestamp: 2,
            step: {
              status: 'completed',
              stepId: result.stepId,
              stepIndex: state.calls - 1,
              startedAt: 1,
              completedAt: 2,
              content: '',
              toolCalls: [
                {
                  id: result.toolCallId,
                  type: 'function',
                  function: {
                    name: result.toolName,
                    arguments: JSON.stringify(args)
                  }
                }
              ]
            }
          }),
          createToolContextRecord({
            recordId: result.toolCallId,
            timestamp: 3,
            result
          })
        ],
        3
      )
    }

    let range: Record<string, unknown> = {}
    let reconstructed = ''
    const modelPages: string[] = []
    for (;;) {
      const result = await dispatchRead('large.txt', range)
      const raw = result.content as ReadResponse
      expect(raw.success).toBe(true)
      expect(raw.file_version).toBe(version)
      expect(result.modelContentKind).toBe('text')
      expect(result.modelContent!.length).toBeLessThanOrEqual(32_000)
      expect(result.modelContent).toContain(raw.content)
      expect(result.modelContent).toContain(version)
      if (raw.truncated) {
        expect(result.modelContent).toContain(`next_read: ${JSON.stringify({
          file_path: 'large.txt',
          start_line: raw.next_start_line,
          start_column: raw.next_start_column
        })}`)
      }
      modelPages.push(result.modelContent!)
      reconstructed += raw.content
      appendResult(result, { file_path: 'large.txt', ...range })
      const request = await manager.prepare()
      expect(
        request.messages
          .filter((message) => message.role === 'tool')
          .map((message) => message.content)
      ).toEqual(modelPages)
      expect(result.modelContent).not.toContain('[tool result content omitted]')
      expect(result.modelContent).not.toContain('[Inline image data omitted]')
      expect(result.modelContent).not.toContain('[Image saved as artifact]')
      if (!raw.truncated) break
      range = {
        start_line: raw.next_start_line,
        start_column: raw.next_start_column
      }
    }
    expect(modelPages.length).toBeGreaterThan(1)
    expect(modelPages[0]).toContain(`data:image/png;base64,${png}`)
    expect(reconstructed).toBe(source)
    await expect(access(join(state.workspace, '.tmp'))).rejects.toMatchObject({
      code: 'ENOENT'
    })

    await writeFile(filePath, source + '\nexternal change')
    const editArgs = {
      file_path: 'large.txt',
      expected_version: version,
      edits: [{ search: 'const image', replace: 'let image' }]
    }
    const stale = await dispatchTool('edit', editArgs)
    expect(stale.failure?.code).toBe('FILE_STALE_VERSION')
    appendResult(stale, editArgs)
    const request = await manager.prepare()
    const toolMessages = request.messages.filter((message) => message.role === 'tool')
    expect(toolMessages.at(-1)?.content).toContain('FILE_STALE_VERSION')
    expect(toolMessages.slice(0, -1).map((message) => message.content)).toEqual(modelPages)
  })

  it('rejects missing write content before creating directories and accepts empty content', async () => {
    const { processWrite } = await import('@main/tools/fileOperations/FileOperationsProcessor')
    const args = {
      chat_uuid: 'integration',
      file_path: 'new/file.txt',
      expected_version: null
    }
    const failure = await processWrite(args as WriteArgs)
    expect(failure.failure).toMatchObject({
      category: 'input',
      code: 'FILE_CONTENT_INVALID'
    })
    await expect(access(join(state.workspace, 'new'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    const success = await processWrite({ ...args, content: '' })
    expect(success.success).toBe(true)
  })

  it.each([
    ['missing', 'operation', 'FILE_NOT_FOUND'],
    ['outside', 'policy', 'PATH_OUTSIDE_WORKSPACE']
  ])(
    'preserves %s failure through transcript into the next model request',
    async (kind, category, code) => {
      const path =
        kind === 'missing'
          ? join(state.workspace, 'missing.txt')
          : `${state.workspace}-outside/file.txt`
      const result = await dispatchRead(path)
      expect(result.status).toBe('success')
      expect(result.content).toMatchObject({ success: false })
      expect(result.failure).toMatchObject({ category, code })
      const record = createToolContextRecord({
        recordId: 'record',
        timestamp: 123,
        result
      })
      const request = projectContextRequest({
        records: [record],
        requestSpec: {
          adapterPluginId: 'stub',
          baseUrl: 'https://example.invalid',
          apiKey: '',
          model: 'stub'
        }
      })
      const content = request.messages.find((message) => message.role === 'tool')?.content
      expect(content).toContain(code)
      expect(content).toContain(category)
      expect(content).toContain(result.failure!.recovery.action)
    }
  )
})
