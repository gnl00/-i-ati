import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isReady: () => false,
    getPath: () => '/tmp'
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
  it('delegates to runtime runner', async () => {
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
    const systemPromptComposer = {
      compose: vi.fn(async () => ['base system prompt'])
    }
    const runtimeRunner = {
      run: vi.fn(async () => ({
        summary: 'runtime summary',
        artifacts: {
          tools_used: ['read'],
          files_touched: []
        }
      }))
    }

    const factory = new SubagentRuntimeFactory(
      appConfigStore as any,
      modelContextResolver as any,
      systemPromptComposer as any,
      runtimeRunner as any
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
        systemPrompt: expect.stringContaining('base system prompt')
      })
    )
  })

  it('reads current chat context through the subagent context seam', async () => {
    const { SubagentRuntimeFactory } = await import('../subagent-runtime-factory')
    const contextReader = {
      getWorkContext: vi.fn(() => 'Current goal: tighten boundaries'),
      listRecentActivity: vi.fn(async () => [{ title: 'Moved contract', details: 'Hosts use agent contract' }])
    }
    const runtimeRunner = {
      run: vi.fn(async () => ({ summary: 'done', artifacts: { tools_used: [], files_touched: [] } }))
    }
    const factory = new SubagentRuntimeFactory(
      { requireConfig: () => ({}) } as any,
      { resolveOrThrow: () => ({ providerDefinition: {}, account: {}, model: {} }) } as any,
      { compose: async () => [] } as any,
      runtimeRunner as any,
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
    const preparedContext = (runtimeRunner.run as any).mock.calls[0][1]
    expect(preparedContext.userMessage).toContain('Moved contract: Hosts use agent contract')
  })

  it.each([
    {
      name: 'missing work context',
      getWorkContext: () => undefined,
      listRecentActivity: async () => [],
      expectedWorkContext: '## Current Goal'
    },
    {
      name: 'work context read failure',
      getWorkContext: () => {
        throw new Error('database unavailable')
      },
      listRecentActivity: async () => [],
      expectedWorkContext: '## Current Goal'
    },
    {
      name: 'activity journal read failure',
      getWorkContext: () => 'Current goal: keep running',
      listRecentActivity: async () => {
        throw new Error('journal unavailable')
      },
      expectedWorkContext: 'Current goal: keep running'
    }
  ])('continues the subagent run after $name', async ({
    getWorkContext,
    listRecentActivity,
    expectedWorkContext
  }) => {
    const { SubagentRuntimeFactory } = await import('../subagent-runtime-factory')
    const runtimeRunner = {
      run: vi.fn(async () => ({ summary: 'continued', artifacts: { tools_used: [], files_touched: [] } }))
    }
    const factory = new SubagentRuntimeFactory(
      { requireConfig: () => ({}) } as any,
      { resolveOrThrow: () => ({ providerDefinition: {}, account: {}, model: {} }) } as any,
      { compose: async () => [] } as any,
      runtimeRunner as any,
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
    const preparedContext = (runtimeRunner.run as any).mock.calls[0][1]
    expect(preparedContext.userMessage).toContain(expectedWorkContext)
  })
})
