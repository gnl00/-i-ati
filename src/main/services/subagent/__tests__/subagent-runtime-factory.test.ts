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
})
