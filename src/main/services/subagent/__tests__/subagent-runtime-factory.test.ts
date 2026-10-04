import { describe, expect, it, vi } from 'vitest'
import { buildSubagentSystemPrompt } from '@shared/prompts/subagent'
import type { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import type { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import type { SubagentRuntimeRunner } from '../runtime/SubagentRuntimeRunner'

vi.mock('electron', () => ({
  app: {
    isReady: (): boolean => false,
    getPath: (): string => '/tmp'
  },
  BrowserWindow: class {},
  shell: {
    openExternal: vi.fn()
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  session: {}
}))

vi.mock('@main/main-window', () => ({
  mainWindow: {
    webContents: {
      send: vi.fn()
    }
  },
  getMainWindow: vi.fn(() => null)
}))

vi.mock('@main/db/chat', () => ({
  chatDb: {
    getChatByUuid: vi.fn(() => ({ id: 1, uuid: 'chat-1' })),
    getWorkspacePathByUuid: vi.fn(() => '/workspace'),
    getMessagesByChatUuid: vi.fn(() => [])
  }
}))

describe('SubagentRuntimeFactory', () => {
  it('delegates the independent worker prompt, model, workspace, and task to the runtime runner', async () => {
    const { SubagentRuntimeFactory } = await import('../subagent-runtime-factory')
    const appConfigStore = {
      requireConfig: vi.fn(() => ({}))
    }
    const modelContext = {
      providerDefinition: {
        adapterPluginId: 'test-adapter',
        requestOverrides: {
          temperature: 0
        }
      },
      account: {
        id: 'acc-1',
        apiUrl: 'https://example.invalid',
        apiKey: 'test-key'
      },
      model: {
        id: 'model-1',
        type: 'chat',
        label: 'Test Model'
      }
    }
    const modelContextResolver = {
      resolveOrThrow: vi.fn(() => modelContext)
    }
    const runtimeRunner = {
      run: vi.fn<SubagentRuntimeRunner['run']>(async () => ({
        summary: 'runtime summary',
        artifacts: {
          tools_used: ['read'],
          files_touched: []
        }
      }))
    }

    const factory = new SubagentRuntimeFactory(
      appConfigStore as unknown as AppConfigStore,
      modelContextResolver as unknown as ChatModelContextResolver,
      runtimeRunner
    )

    const result = await factory.run({
      subagentId: 'sub-1',
      task: 'Inspect the runtime path',
      role: 'researcher',
      contextMode: 'minimal',
      files: ['src/main/services/subagent/subagent-runtime-factory.ts'],
      modelRef: {
        accountId: 'acc-1',
        modelId: 'model-1'
      }
    })

    expect(result.summary).toBe('runtime summary')
    expect(runtimeRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        subagentId: 'sub-1'
      }),
      expect.objectContaining({
        modelContext,
        allowedTools: expect.any(Array),
        userMessage: expect.stringContaining('Inspect the runtime path'),
        systemPrompt: buildSubagentSystemPrompt('researcher'),
        workspacePath: process.cwd()
      })
    )
    const preparedContext = runtimeRunner.run.mock.calls[0][1]
    expect(preparedContext.userMessage).toContain('# File Hints')
    expect(preparedContext.userMessage).toContain('src/main/services/subagent/subagent-runtime-factory.ts')
    expect(preparedContext.allowedTools).toContain('read')
    expect(preparedContext.allowedTools).not.toContain('write')
    expect(preparedContext.allowedTools).not.toContain('subagent')
  })

  it('keeps explicit task constraints and custom roles in minimal mode without reading parent state', async () => {
    const { SubagentRuntimeFactory } = await import('../subagent-runtime-factory')
    const contextReader = {
      getWorkContext: vi.fn(),
      listRecentActivity: vi.fn()
    }
    const runtimeRunner = {
      run: vi.fn<SubagentRuntimeRunner['run']>(async () => ({
        summary: 'inspected',
        artifacts: { tools_used: [], files_touched: [] }
      }))
    }
    const factory = new SubagentRuntimeFactory(
      { requireConfig: () => ({}) } as unknown as AppConfigStore,
      {
        resolveOrThrow: () => ({
          providerDefinition: {},
          account: {},
          model: {}
        })
      } as unknown as ChatModelContextResolver,
      runtimeRunner,
      contextReader
    )
    const input = {
      subagentId: 'sub-minimal',
      task: 'Inspect the parser. Do not edit files.',
      role: 'parser specialist',
      contextMode: 'minimal' as const,
      chatUuid: 'chat-1',
      files: ['src/parser.ts'],
      parentSubmissionId: 'parent-1',
      permissionApprovalMode: 'manual' as const,
      modelRef: { accountId: 'acc-1', modelId: 'model-1' }
    }

    await factory.run(input)

    expect(contextReader.getWorkContext).not.toHaveBeenCalled()
    expect(contextReader.listRecentActivity).not.toHaveBeenCalled()
    expect(runtimeRunner.run).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        systemPrompt: buildSubagentSystemPrompt(input.role),
        userMessage: expect.stringContaining(input.task),
        workspacePath: '/workspace'
      })
    )
    const preparedContext = runtimeRunner.run.mock.calls[0][1]
    expect(preparedContext.userMessage).toContain('src/parser.ts')
    expect(preparedContext.userMessage).not.toContain('# Recent Chat Context')
    expect(preparedContext.userMessage).not.toContain('# Work Context')
    expect(preparedContext.userMessage).not.toContain('# Recent Activity Journal')
  })

  it('reads current chat context through the subagent context seam', async () => {
    const { SubagentRuntimeFactory } = await import('../subagent-runtime-factory')
    const contextReader = {
      getWorkContext: vi.fn(() => 'Current goal: tighten boundaries'),
      listRecentActivity: vi.fn(async () => [{ title: 'Moved contract', details: 'Hosts use agent contract' }])
    }
    const runtimeRunner = {
      run: vi.fn<SubagentRuntimeRunner['run']>(async () => ({
        summary: 'done',
        artifacts: { tools_used: [], files_touched: [] }
      }))
    }
    const factory = new SubagentRuntimeFactory(
      { requireConfig: () => ({}) } as unknown as AppConfigStore,
      {
        resolveOrThrow: () => ({
          providerDefinition: {},
          account: {},
          model: {}
        })
      } as unknown as ChatModelContextResolver,
      runtimeRunner,
      contextReader
    )

    await factory.run({
      subagentId: 'sub-context',
      task: 'Review context',
      role: 'reviewer',
      contextMode: 'current_chat_summary',
      chatUuid: 'chat-1',
      files: [],
      modelRef: { accountId: 'acc-1', modelId: 'model-1' }
    })

    expect(contextReader.getWorkContext).toHaveBeenCalledWith('chat-1')
    expect(contextReader.listRecentActivity).toHaveBeenCalledWith('chat-1', 5)
    expect(runtimeRunner.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userMessage: expect.stringContaining('Current goal: tighten boundaries')
      })
    )
    const preparedContext = runtimeRunner.run.mock.calls[0][1]
    expect(preparedContext.userMessage).toContain('Moved contract: Hosts use agent contract')
    expect(preparedContext.systemPrompt).toBe(buildSubagentSystemPrompt('reviewer'))
    expect(preparedContext.workspacePath).toBe('/workspace')
  })

  it.each([
    {
      name: 'missing work context',
      getWorkContext: (): undefined => undefined,
      listRecentActivity: async (): Promise<[]> => [],
      expectedWorkContext: '## Current Goal'
    },
    {
      name: 'work context read failure',
      getWorkContext: (): never => {
        throw new Error('database unavailable')
      },
      listRecentActivity: async (): Promise<[]> => [],
      expectedWorkContext: '## Current Goal'
    },
    {
      name: 'activity journal read failure',
      getWorkContext: (): string => 'Current goal: keep running',
      listRecentActivity: async (): Promise<never> => {
        throw new Error('journal unavailable')
      },
      expectedWorkContext: 'Current goal: keep running'
    }
  ])('continues the subagent run after $name', async ({ getWorkContext, listRecentActivity, expectedWorkContext }) => {
    const { SubagentRuntimeFactory } = await import('../subagent-runtime-factory')
    const runtimeRunner = {
      run: vi.fn<SubagentRuntimeRunner['run']>(async () => ({
        summary: 'continued',
        artifacts: { tools_used: [], files_touched: [] }
      }))
    }
    const factory = new SubagentRuntimeFactory(
      { requireConfig: () => ({}) } as unknown as AppConfigStore,
      {
        resolveOrThrow: () => ({
          providerDefinition: {},
          account: {},
          model: {}
        })
      } as unknown as ChatModelContextResolver,
      runtimeRunner,
      { getWorkContext, listRecentActivity }
    )

    const result = await factory.run({
      subagentId: 'sub-resilient',
      task: 'Continue with available context',
      role: 'researcher',
      contextMode: 'current_chat_summary',
      chatUuid: 'chat-1',
      files: [],
      modelRef: { accountId: 'acc-1', modelId: 'model-1' }
    })

    expect(result.summary).toBe('continued')
    expect(runtimeRunner.run).toHaveBeenCalledOnce()
    const preparedContext = runtimeRunner.run.mock.calls[0][1]
    expect(preparedContext.userMessage).toContain(expectedWorkContext)
  })
})
