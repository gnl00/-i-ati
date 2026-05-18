import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, execMock, getPathMock, getWorkspacePathByUuidMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execMock: vi.fn(),
  getPathMock: vi.fn(),
  getWorkspacePathByUuidMock: vi.fn()
}))

vi.mock('child_process', () => ({
  exec: execMock,
  execFile: execFileMock
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getWorkspacePathByUuid: getWorkspacePathByUuidMock
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

describe('CommandProcessor.executeCommand filesystem scope', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    execMock.mockReset()
    getPathMock.mockReturnValue('/tmp/ati-user-data')
    getWorkspacePathByUuidMock.mockReturnValue('/tmp/ati-workspace')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires confirmation when filesystem scope is missing', async () => {
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      chat_uuid: 'chat-1'
    })

    expect(result.success).toBe(false)
    expect(result.requires_confirmation).toBe(true)
    expect(result.filesystem_scope).toBe('unknown')
    expect(execFileMock).not.toHaveBeenCalled()
    expect(execMock).not.toHaveBeenCalled()
  })

  it('requires confirmation for home directory reads with low risk score', async () => {
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'cat ~/.zshrc',
      execution_reason: 'Inspect shell config',
      possible_risk: 'Read-only command',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'The command was expected to be a read.',
      chat_uuid: 'chat-2'
    })

    expect(result.success).toBe(false)
    expect(result.requires_confirmation).toBe(true)
    expect(result.filesystem_scope).toBe('workspace')
    expect(result.filesystem_scope_reason).toContain('home directory')
    expect(execFileMock).not.toHaveBeenCalled()
    expect(execMock).not.toHaveBeenCalled()
  })
})
