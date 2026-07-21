import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, loggerMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('child_process', () => ({
  execFile: execFileMock
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => loggerMock)
}))

import {
  ensureLoginShellPath,
  resetLoginShellPathForTests
} from '../shellEnvironment'

const START_MARKER = '__ATI_LOGIN_SHELL_PATH_START__'
const END_MARKER = '__ATI_LOGIN_SHELL_PATH_END__'

function succeedWithPath(pathValue: string, prefix = '', suffix = ''): void {
  execFileMock.mockImplementationOnce(
    (
      _shell: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      callback(null, `${prefix}${START_MARKER}${pathValue}${END_MARKER}${suffix}`, '')
    }
  )
}

function failWith(
  error: Error & {
    code?: string | number
    killed?: boolean
    signal?: string
  }
): void {
  execFileMock.mockImplementationOnce(
    (
      _shell: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      callback(error, '', '')
    }
  )
}

describe('ensureLoginShellPath', () => {
  const originalPath = process.env.PATH
  const originalShell = process.env.SHELL

  beforeEach(() => {
    execFileMock.mockReset()
    loggerMock.info.mockReset()
    loggerMock.debug.mockReset()
    loggerMock.warn.mockReset()
    loggerMock.error.mockReset()
    resetLoginShellPathForTests()
    process.env.PATH = '/electron/bin:/shared/bin'
    process.env.SHELL = '/custom/shell'
  })

  afterEach(() => {
    process.env.PATH = originalPath
    if (originalShell === undefined) {
      delete process.env.SHELL
    } else {
      process.env.SHELL = originalShell
    }
    vi.restoreAllMocks()
  })

  it('probes once and merges login shell entries before unique Electron entries', async () => {
    succeedWithPath('/shell/bin:/shared/bin:/shell/bin')

    const result = await ensureLoginShellPath()
    const cachedResult = await ensureLoginShellPath()

    expect(result).toBe('/shell/bin:/shared/bin:/electron/bin')
    expect(cachedResult).toBe(result)
    expect(process.env.PATH).toBe(result)
    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(execFileMock).toHaveBeenCalledWith(
      '/custom/shell',
      ['-ilc', expect.stringContaining('printf')],
      expect.objectContaining({
        timeout: 5_000,
        maxBuffer: 64 * 1024,
        env: expect.objectContaining({
          DISABLE_AUTO_UPDATE: 'true',
          ZSH_TMUX_AUTOSTARTED: 'true',
          ZSH_TMUX_AUTOSTART: 'false'
        })
      }),
      expect.any(Function)
    )
    expect(loggerMock.info).toHaveBeenCalledWith(
      'shell_environment.login_path_probe_succeeded',
      expect.objectContaining({
        shell: '/custom/shell',
        attemptCount: 1,
        durationMs: expect.any(Number),
        addedPathEntryCount: 1,
        mergedPathEntryCount: 3
      })
    )
  })

  it('shares the same in-flight probe across concurrent callers', async () => {
    let completeProbe: ((error: Error | null, stdout: string, stderr: string) => void) | undefined
    execFileMock.mockImplementationOnce(
      (
        _shell: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        completeProbe = callback
      }
    )

    const first = ensureLoginShellPath()
    const second = ensureLoginShellPath()

    expect(first).toBe(second)
    expect(execFileMock).toHaveBeenCalledTimes(1)

    completeProbe?.(null, `${START_MARKER}/shell/bin${END_MARKER}`, '')
    await expect(first).resolves.toBe('/shell/bin:/electron/bin:/shared/bin')
  })

  it('falls back to the next shell after a candidate fails', async () => {
    failWith(Object.assign(new Error('missing shell'), { code: 'ENOENT' }))
    succeedWithPath('/zsh/bin')

    await expect(ensureLoginShellPath()).resolves.toBe(
      '/zsh/bin:/electron/bin:/shared/bin'
    )

    expect(execFileMock).toHaveBeenCalledTimes(2)
    expect(execFileMock.mock.calls[0][0]).toBe('/custom/shell')
    expect(execFileMock.mock.calls[1][0]).toBe('/bin/zsh')
  })

  it('parses the marked PATH when shell startup writes surrounding noise', async () => {
    succeedWithPath(
      '/shell/bin:/shared/bin',
      'welcome from shell startup\n',
      '\nstartup cleanup complete\n'
    )

    await expect(ensureLoginShellPath()).resolves.toBe(
      '/shell/bin:/shared/bin:/electron/bin'
    )
  })

  it('falls back after timeout and preserves the Electron PATH when every shell fails', async () => {
    process.env.SHELL = '/bin/zsh'
    const timeoutError = Object.assign(new Error('timed out'), {
      code: 'ETIMEDOUT',
      killed: true,
      signal: 'SIGTERM'
    })
    failWith(timeoutError)
    failWith(Object.assign(new Error('bash failed'), { code: 1 }))
    failWith(Object.assign(new Error('sh failed'), { code: 1 }))

    await expect(ensureLoginShellPath()).resolves.toBe(
      '/electron/bin:/shared/bin'
    )
    expect(process.env.PATH).toBe('/electron/bin:/shared/bin')
    expect(execFileMock).toHaveBeenCalledTimes(3)
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'shell_environment.login_path_probe_failed',
      expect.objectContaining({
        candidateCount: 3,
        durationMs: expect.any(Number),
        failures: expect.arrayContaining([
          expect.objectContaining({
            shell: '/bin/zsh',
            code: 'ETIMEDOUT',
            killed: true,
            signal: 'SIGTERM'
          })
        ])
      })
    )
  })

  it('falls back when a shell exits without a marked PATH', async () => {
    execFileMock.mockImplementationOnce(
      (
        _shell: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => callback(null, 'shell startup output only', '')
    )
    succeedWithPath('/zsh/bin')

    await expect(ensureLoginShellPath()).resolves.toBe(
      '/zsh/bin:/electron/bin:/shared/bin'
    )
    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('uses the current PATH directly on Windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    await expect(ensureLoginShellPath()).resolves.toBe(
      '/electron/bin:/shared/bin'
    )
    expect(execFileMock).toHaveBeenCalledTimes(0)
    expect(loggerMock.debug).toHaveBeenCalledWith(
      'shell_environment.login_path_probe_skipped',
      expect.objectContaining({ platform: 'win32' })
    )
  })
})
