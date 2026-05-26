import { describe, expect, it, vi } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'

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
  it('has a handler for every public embedded tool definition', async () => {
    const { toolHandlers } = await import('../index')
    const missing = (tools as ToolDefinition[])
      .map(tool => tool.function.name)
      .filter(toolName => !toolHandlers[toolName])

    expect(missing).toEqual([])
  })
})
