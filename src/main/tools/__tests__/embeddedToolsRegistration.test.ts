import { describe, expect, it, vi } from 'vitest'
import tools from '@tools/definitions'
import type { EmbeddedToolExecutionContext, ToolDefinition } from '@tools/registry'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/ati-test'),
    isReady: vi.fn(() => true)
  },
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: vi.fn()
  },
  net: {
    fetch: vi.fn()
  },
  shell: {
    openExternal: vi.fn()
  },
  session: {
    defaultSession: {}
  }
}))

vi.mock('@main/main-window', () => ({
  getMainWindow: vi.fn(() => null)
}))

describe('main embedded tool handlers', () => {
  it('publishes successful Read text as a literal model view and preserves raw results', async () => {
    const files = await import('../fileOperations/FileOperationsProcessor')
    const { toolHandlers } = await import('../index')
    const result = {
      success: true,
      file_path: 'sample.ts',
      file_version: `sha256:${'a'.repeat(64)}`,
      content: 'const image = "data:image/png;base64,literal"',
      line_ending: 'none' as const,
      bom: false,
      returned_start_line: 1,
      returned_end_line: 1,
      returned_start_column: 1,
      returned_end_column: 46,
      lines: 1,
      truncated: false
    }
    const read = vi.spyOn(files, 'processRead').mockResolvedValueOnce(result)
    const setModelContent = vi.fn()
    const context: EmbeddedToolExecutionContext = { setModelContent }
    const args = { file_path: 'sample.ts' }
    try {
      await expect(toolHandlers.read(args, context)).resolves.toBe(result)
      expect(read).toHaveBeenCalledWith(args, context)
      expect(setModelContent).toHaveBeenCalledWith(files.formatReadResultForModel(result), { kind: 'text' })

      setModelContent.mockClear()
      read.mockResolvedValueOnce({ success: false, error: 'File not found' })
      await expect(toolHandlers.read(args, context)).resolves.toMatchObject({ success: false })
      expect(setModelContent).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it('routes tg_gateway_tool to the Telegram lifecycle processor', async () => {
    const { toolHandlers } = await import('../index')
    const { processTelegramGateway } = await import('../telegram/TelegramToolsProcessor')
    expect(toolHandlers.tg_gateway_tool).toBe(processTelegramGateway)
    await expect(toolHandlers.tg_gateway_tool({ action: 'restart' })).resolves.toMatchObject({ success: false })
  })

  it('has a handler for every public embedded tool definition', async () => {
    const { toolHandlers } = await import('../index')
    const missing = (tools as ToolDefinition[])
      .map(tool => tool.function.name)
      .filter(toolName => !toolHandlers[toolName])

    expect(missing).toEqual([])
  })

  it('registers only the unified computer_use handler', async () => {
    const { toolHandlers } = await import('../index')
    expect(Object.keys(toolHandlers).filter(name => name.startsWith('computer_use'))).toEqual(['computer_use'])
    await expect(toolHandlers.computer_use({ action: 'invalid' })).resolves.toMatchObject({
      success: false, action: 'invalid', error: expect.stringContaining('Unsupported')
    })
  })

  it('keeps consolidated resource handler registration canonical', async () => {
    const { toolHandlers } = await import('../index')
    const resourceHandlerNames = Object.keys(toolHandlers)
      .filter(name => ['plan', 'schedule', 'wiki', 'user_info', 'soul', 'subagent', 'session_context'].some(resource => (
        name === resource || name.startsWith(`${resource}_`)
      )))
      .sort()

    expect(resourceHandlerNames).toEqual(['plan', 'schedule', 'session_context', 'soul', 'subagent', 'user_info', 'wiki'])
  })
})
