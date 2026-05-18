import { mkdtemp, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_ENSURE_DIRECTORY } from '@shared/constants'

const { getPathMock, ipcMainHandleMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
  ipcMainHandleMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  },
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

describe('workspace ipc', () => {
  let userDataDir: string

  beforeEach(async () => {
    ipcMainHandleMock.mockReset()
    getPathMock.mockReset()
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-workspace-ipc-'))
    getPathMock.mockReturnValue(userDataDir)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
  })

  it('registers the ensure workspace directory handler', async () => {
    const { registerWorkspaceHandlers } = await import('../workspace')

    registerWorkspaceHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)
    expect(registeredChannels).toContain(WORKSPACE_ENSURE_DIRECTORY)
  })

  it('rebases default workspace paths to app userData', async () => {
    const { ensureWorkspaceDirectory } = await import('../workspace')

    const result = await ensureWorkspaceDirectory({
      chat_uuid: 'chat-1',
      workspace_path: 'workspaces/chat-1'
    })

    const expectedPath = join(userDataDir, 'workspaces', 'chat-1')
    const stats = await stat(expectedPath)
    expect(stats.isDirectory()).toBe(true)
    expect(result).toMatchObject({
      success: true,
      path: expectedPath,
      created: true
    })
  })

  it('creates absolute custom workspace directories', async () => {
    const { ensureWorkspaceDirectory } = await import('../workspace')
    const customPath = join(userDataDir, 'custom-root')

    const result = await ensureWorkspaceDirectory({
      chat_uuid: 'chat-2',
      workspace_path: customPath
    })

    const stats = await stat(customPath)
    expect(stats.isDirectory()).toBe(true)
    expect(result).toMatchObject({
      success: true,
      path: customPath,
      created: true
    })
  })

  it('reports an existing file at the workspace path', async () => {
    const { ensureWorkspaceDirectory } = await import('../workspace')
    const filePath = join(userDataDir, 'workspace-file')
    await writeFile(filePath, 'content')

    const result = await ensureWorkspaceDirectory({
      chat_uuid: 'chat-3',
      workspace_path: filePath
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Workspace path exists')
  })
})
