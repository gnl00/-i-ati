import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeEnsureWorkspaceDirectoryMock } = vi.hoisted(() => ({
  invokeEnsureWorkspaceDirectoryMock: vi.fn()
}))

vi.mock('@renderer/tools/workspace/renderer/WorkspaceInvoker', () => ({
  invokeEnsureWorkspaceDirectory: invokeEnsureWorkspaceDirectoryMock
}))

describe('workspaceUtils', () => {
  beforeEach(() => {
    invokeEnsureWorkspaceDirectoryMock.mockReset()
  })

  it('uses custom workspace paths when creating a workspace', async () => {
    invokeEnsureWorkspaceDirectoryMock.mockResolvedValue({
      success: true,
      path: '/tmp/custom-workspace',
      created: true
    })
    const { createWorkspace } = await import('../workspaceUtils')

    const result = await createWorkspace('chat-1', '/tmp/custom-workspace')

    expect(invokeEnsureWorkspaceDirectoryMock).toHaveBeenCalledWith({
      chat_uuid: 'chat-1',
      workspace_path: '/tmp/custom-workspace'
    })
    expect(result).toEqual({
      success: true,
      path: '/tmp/custom-workspace',
      created: true
    })
  })

  it('uses the saved custom path when switching workspace', async () => {
    invokeEnsureWorkspaceDirectoryMock.mockResolvedValue({
      success: true,
      path: '/tmp/saved-workspace',
      created: false
    })
    const { switchWorkspace } = await import('../workspaceUtils')

    const result = await switchWorkspace('chat-2', '/tmp/saved-workspace')

    expect(invokeEnsureWorkspaceDirectoryMock).toHaveBeenCalledWith({
      chat_uuid: 'chat-2',
      workspace_path: '/tmp/saved-workspace'
    })
    expect(result).toEqual({
      success: true,
      path: '/tmp/saved-workspace',
      created: false
    })
  })
})
