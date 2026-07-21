import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const {
  runCommandProcessMock,
  getPathMock,
  getWorkspacePathByUuidMock,
  ensureLoginShellPathMock
} = vi.hoisted(() => ({
  runCommandProcessMock: vi.fn(),
  getPathMock: vi.fn(),
  getWorkspacePathByUuidMock: vi.fn(),
  ensureLoginShellPathMock: vi.fn()
}))

vi.mock('@main/services/command/CommandProcessRunner', () => ({
  CommandProcessSpawnError: class CommandProcessSpawnError extends Error {
    code?: string | number
    result: unknown

    constructor(error: { message?: string; code?: string | number }, result: unknown) {
      super(error.message)
      this.code = error.code
      this.result = result
    }
  },
  runCommandProcess: runCommandProcessMock
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

vi.mock('@main/services/shellEnvironment', () => ({
  ensureLoginShellPath: ensureLoginShellPathMock
}))

describe('CommandProcessor.executeCommand filesystem scope', () => {
  const temporaryDirectories: string[] = []

  beforeEach(() => {
    runCommandProcessMock.mockReset()
    runCommandProcessMock.mockResolvedValue({
      stdout: '/tmp/ati-workspace',
      stderr: '',
      stdoutBytes: 18,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      exitCode: 0,
      terminationSignal: null,
      executionTimeMs: 5,
      timedOut: false,
      aborted: false
    })
    ensureLoginShellPathMock.mockReset()
    ensureLoginShellPathMock.mockResolvedValue('/login-shell/bin')
    getPathMock.mockReturnValue('/tmp/ati-user-data')
    getWorkspacePathByUuidMock.mockReturnValue('/tmp/ati-workspace')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
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
    expect(ensureLoginShellPathMock).not.toHaveBeenCalled()
    expect(runCommandProcessMock).not.toHaveBeenCalled()
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
    expect(ensureLoginShellPathMock).not.toHaveBeenCalled()
    expect(runCommandProcessMock).not.toHaveBeenCalled()
  })

  it('probes the login shell PATH after review and preserves explicit env.PATH precedence', async () => {
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read the current workspace directory.',
      env: {
        PATH: '/explicit/bin'
      },
      confirmed: true,
      chat_uuid: 'chat-3'
    })

    expect(result.success).toBe(true)
    expect(ensureLoginShellPathMock).toHaveBeenCalledTimes(1)
    expect(runCommandProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [],
        cwd: '/tmp/ati-workspace',
        env: expect.objectContaining({
          PATH: '/explicit/bin',
          FORCE_COLOR: '0'
        })
      })
    )
  })

  it('requires confirmation before applying an explicit executable search PATH', async () => {
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read the current workspace directory.',
      env: {
        PATH: '/explicit/bin'
      },
      chat_uuid: 'chat-env-review'
    })

    expect(result).toMatchObject({
      success: false,
      requires_confirmation: true,
      filesystem_scope: 'workspace'
    })
    expect(result.filesystem_scope_reason).toContain('PATH')
    expect(ensureLoginShellPathMock).not.toHaveBeenCalled()
    expect(runCommandProcessMock).not.toHaveBeenCalled()
  })

  it('runs from a workspace subdirectory without additional confirmation', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'ati-command-workspace-'))
    temporaryDirectories.push(workspaceRoot)
    mkdirSync(join(workspaceRoot, 'packages', 'app'), { recursive: true })
    getWorkspacePathByUuidMock.mockReturnValueOnce(workspaceRoot)
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'pwd',
      cwd: 'packages/app',
      execution_reason: 'Check package directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read a package inside the workspace.',
      chat_uuid: 'chat-safe-cwd'
    })

    expect(result.success).toBe(true)
    expect(runCommandProcessMock).toHaveBeenCalledWith(expect.objectContaining({
      cwd: join(workspaceRoot, 'packages', 'app')
    }))
  })

  it.each(['/etc', '../../etc'])(
    'requires confirmation before using cwd outside the workspace: %s',
    async (cwd) => {
      const { processExecuteCommand } = await import('../CommandProcessor')

      const result = await processExecuteCommand({
        command: 'pwd',
        cwd,
        execution_reason: 'Check selected directory',
        possible_risk: 'Low risk',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'Read the selected directory.',
        chat_uuid: 'chat-external-cwd'
      })

      expect(result.success).toBe(false)
      expect(result.requires_confirmation).toBe(true)
      expect(result.filesystem_scope_reason).toContain(cwd)
      expect(ensureLoginShellPathMock).not.toHaveBeenCalled()
      expect(runCommandProcessMock).not.toHaveBeenCalled()
    }
  )

  it('requires confirmation when cwd follows a symlink outside the workspace', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'ati-command-workspace-'))
    const outsideRoot = mkdtempSync(join(tmpdir(), 'ati-command-outside-'))
    temporaryDirectories.push(workspaceRoot, outsideRoot)
    symlinkSync(outsideRoot, join(workspaceRoot, 'external'))
    getWorkspacePathByUuidMock.mockReturnValueOnce(workspaceRoot)
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'pwd',
      cwd: 'external',
      execution_reason: 'Check selected directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read a workspace path.',
      chat_uuid: 'chat-symlink-cwd'
    })

    expect(result.success).toBe(false)
    expect(result.requires_confirmation).toBe(true)
    expect(result.filesystem_scope_reason).toContain('external')
    expect(runCommandProcessMock).not.toHaveBeenCalled()
  })

  it('allows an explicitly confirmed cwd outside the workspace', async () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'ati-command-approved-'))
    temporaryDirectories.push(outsideRoot)
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'pwd',
      cwd: outsideRoot,
      execution_reason: 'Inspect an approved directory',
      possible_risk: 'Reads outside the workspace',
      risk_score: 0,
      filesystem_scope: 'outside_workspace',
      filesystem_scope_reason: 'The user approved this directory.',
      confirmed: true,
      chat_uuid: 'chat-approved-cwd'
    })

    expect(result.success).toBe(true)
    expect(runCommandProcessMock).toHaveBeenCalledWith(expect.objectContaining({
      cwd: outsideRoot
    }))
  })

  it('passes AbortSignal and output callbacks to the process runner', async () => {
    const { processExecuteCommand } = await import('../CommandProcessor')
    const controller = new AbortController()
    const onOutput = vi.fn()

    await processExecuteCommand({
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read the current workspace directory.',
      chat_uuid: 'chat-4'
    }, {
      signal: controller.signal,
      onOutput
    })

    expect(runCommandProcessMock).toHaveBeenCalledWith(expect.objectContaining({
      signal: controller.signal,
      onOutput
    }))
  })

  it('aborts promptly while the shared login-shell PATH probe continues', async () => {
    let finishProbe: (() => void) | undefined
    ensureLoginShellPathMock.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishProbe = resolve
    }))
    const { processExecuteCommand } = await import('../CommandProcessor')
    const controller = new AbortController()
    const execution = processExecuteCommand({
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read the current workspace directory.',
      chat_uuid: 'chat-probe-abort'
    }, {
      signal: controller.signal
    })

    controller.abort()

    await expect(execution).rejects.toMatchObject({ name: 'AbortError' })
    expect(runCommandProcessMock).not.toHaveBeenCalled()
    finishProbe?.()
  })

  it('propagates an in-flight abort as AbortError', async () => {
    runCommandProcessMock.mockResolvedValueOnce({
      stdout: 'partial output',
      stderr: '',
      stdoutBytes: 14,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      exitCode: null,
      terminationSignal: 'SIGTERM',
      executionTimeMs: 20,
      timedOut: false,
      aborted: true
    })
    const { processExecuteCommand } = await import('../CommandProcessor')

    await expect(processExecuteCommand({
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read the current workspace directory.',
      chat_uuid: 'chat-abort'
    })).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Command execution aborted'
    })
  })

  it('maps timeout metadata and bounded output facts into the command response', async () => {
    runCommandProcessMock.mockResolvedValueOnce({
      stdout: 'HEAD\n\n[command output truncated; 600000 original bytes]\n\nTAIL',
      stderr: 'timeout warning',
      stdoutBytes: 600_000,
      stderrBytes: 15,
      stdoutTruncated: true,
      stderrTruncated: false,
      exitCode: null,
      terminationSignal: 'SIGTERM',
      executionTimeMs: 51,
      timedOut: true,
      aborted: false
    })
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Read the current workspace directory.',
      timeout: 50,
      chat_uuid: 'chat-5'
    })

    expect(result).toMatchObject({
      success: false,
      stdout_bytes: 600_000,
      stderr_bytes: 15,
      stdout_truncated: true,
      stderr_truncated: false,
      exit_code: -1,
      termination_signal: 'SIGTERM',
      execution_time: 51,
      error: 'Command timeout after 50ms'
    })
  })

  it('normalizes invalid and out-of-range timeout values', async () => {
    const { processExecuteCommand } = await import('../CommandProcessor')
    const commandArgs = {
      command: 'pwd',
      execution_reason: 'Check current directory',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace' as const,
      filesystem_scope_reason: 'Read the current workspace directory.',
      chat_uuid: 'chat-timeout-bounds'
    }

    await processExecuteCommand({ ...commandArgs, timeout: Number.NaN })
    await processExecuteCommand({ ...commandArgs, timeout: 0 })
    await processExecuteCommand({ ...commandArgs, timeout: Number.MAX_SAFE_INTEGER })

    expect(runCommandProcessMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ timeoutMs: 30_000 })
    )
    expect(runCommandProcessMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ timeoutMs: 1 })
    )
    expect(runCommandProcessMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ timeoutMs: 86_400_000 })
    )
  })

  it('retries the next explicit shell when a complex command shell is missing', async () => {
    vi.stubEnv('SHELL', '/missing/shell')
    const { CommandProcessSpawnError } = await import(
      '@main/services/command/CommandProcessRunner'
    )
    runCommandProcessMock.mockRejectedValueOnce(new CommandProcessSpawnError(
      { message: 'spawn ENOENT', code: 'ENOENT' },
      {
        stdout: '',
        stderr: '',
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
        exitCode: null,
        terminationSignal: null,
        executionTimeMs: 1,
        timedOut: false,
        aborted: false
      }
    ))
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: 'printf hello | wc -c',
      execution_reason: 'Count command output',
      possible_risk: 'Low risk',
      risk_score: 0,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Runs within the current workspace.',
      confirmed: true,
      chat_uuid: 'chat-6'
    })

    expect(result.success).toBe(true)
    expect(runCommandProcessMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      executable: '/missing/shell',
      args: ['-c', 'printf hello | wc -c']
    }))
    expect(runCommandProcessMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      executable: '/bin/zsh',
      args: ['-c', 'printf hello | wc -c']
    }))
  })

  it('routes Windows command shims through cmd.exe', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    vi.stubEnv('COMSPEC', 'C:\\Windows\\System32\\cmd.exe')
    const { processExecuteCommand } = await import('../CommandProcessor')

    try {
      const result = await processExecuteCommand({
        command: '/tmp/pnpm.cmd install',
        execution_reason: 'Install workspace dependencies',
        possible_risk: 'Runs a package manager in the workspace.',
        risk_score: 3,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'Installs dependencies in the workspace.',
        confirmed: true,
        chat_uuid: 'chat-win'
      })

      expect(result.success).toBe(true)
      expect(runCommandProcessMock).toHaveBeenCalledWith(expect.objectContaining({
        executable: 'C:\\Windows\\System32\\cmd.exe',
        args: ['/d', '/s', '/c', '/tmp/pnpm.cmd install']
      }))
    } finally {
      platform.mockRestore()
    }
  })

  it('uses direct executable arguments for internal skill invocations', async () => {
    const { processExecuteCommand } = await import('../CommandProcessor')

    const result = await processExecuteCommand({
      command: "bun 'scripts/example.ts' 'value with spaces'",
      execution_reason: 'Run a skill script',
      possible_risk: 'Runs an available skill script.',
      risk_score: 3,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Runs within the current workspace.',
      confirmed: true,
      chat_uuid: 'chat-internal'
    }, undefined, {
      executable: 'bun',
      args: ['/tmp/skill/scripts/example.ts', 'value with spaces', "Bob's house"]
    })

    expect(result.success).toBe(true)
    expect(runCommandProcessMock).toHaveBeenCalledWith(expect.objectContaining({
      executable: expect.stringMatching(/(?:^|[/\\])bun(?:\.exe)?$/),
      args: ['/tmp/skill/scripts/example.ts', 'value with spaces', "Bob's house"]
    }))
  })

  it('quotes internal Windows shim arguments before cmd.exe execution', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    vi.stubEnv('COMSPEC', 'C:\\Windows\\System32\\cmd.exe')
    const { processExecuteCommand } = await import('../CommandProcessor')

    try {
      const result = await processExecuteCommand({
        command: "scripts\\example.cmd 'a&b' '%PATH%'",
        execution_reason: 'Run a skill script',
        possible_risk: 'Runs an available skill script.',
        risk_score: 3,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'Runs within the current workspace.',
        confirmed: true,
        chat_uuid: 'chat-win-internal'
      }, undefined, {
        executable: '/tmp/example.cmd',
        args: ['a&b', '%PATH%']
      })

      expect(result.success).toBe(true)
      expect(runCommandProcessMock).toHaveBeenCalledWith(expect.objectContaining({
        executable: 'C:\\Windows\\System32\\cmd.exe',
        args: [
          '/d',
          '/s',
          '/c',
          '"/tmp/example.cmd ^"a^&b^" ^"^%PATH^%^""'
        ],
        windowsVerbatimArguments: true
      }))
    } finally {
      platform.mockRestore()
    }
  })
})
