import { execFile } from 'child_process'
import { delimiter } from 'path'
import { createLogger } from '@main/logging/LogService'

const logger = createLogger('ShellEnvironment')

const LOGIN_SHELL_TIMEOUT_MS = 5_000
const LOGIN_SHELL_MAX_BUFFER = 64 * 1024
const PATH_START_MARKER = '__ATI_LOGIN_SHELL_PATH_START__'
const PATH_END_MARKER = '__ATI_LOGIN_SHELL_PATH_END__'
const LOGIN_SHELL_PATH_PROBE =
  `printf '\\n${PATH_START_MARKER}%s${PATH_END_MARKER}\\n' "$PATH"`

interface ProbeFailure {
  shell: string
  code?: string | number
  signal?: string
  killed?: boolean
  reason?: 'invalid_output'
}

let loginShellPathPromise: Promise<string | undefined> | null = null

function resolveLoginShellCandidates(): string[] {
  return Array.from(
    new Set(
      [
        process.env.SHELL,
        '/bin/zsh',
        '/bin/bash',
        '/bin/sh'
      ].filter((shell): shell is string => Boolean(shell))
    )
  )
}

function extractPath(stdout: string): string | null {
  const markerStart = stdout.lastIndexOf(PATH_START_MARKER)
  if (markerStart === -1) {
    return null
  }

  const pathStart = markerStart + PATH_START_MARKER.length
  const markerEnd = stdout.indexOf(PATH_END_MARKER, pathStart)
  if (markerEnd === -1) {
    return null
  }

  const pathValue = stdout.slice(pathStart, markerEnd)
  return pathValue.length > 0 ? pathValue : null
}

function mergePath(loginShellPath: string, currentPath: string | undefined): string {
  const entries = [loginShellPath, currentPath ?? '']
    .flatMap((pathValue) => pathValue.split(delimiter))
    .filter((entry) => entry.length > 0)

  return Array.from(new Set(entries)).join(delimiter)
}

function countAddedPathEntries(loginShellPath: string, currentPath: string | undefined): number {
  const currentEntries = new Set((currentPath ?? '').split(delimiter).filter(Boolean))
  const loginShellEntries = new Set(loginShellPath.split(delimiter).filter(Boolean))
  return Array.from(loginShellEntries).filter((entry) => !currentEntries.has(entry)).length
}

function probeLoginShellPath(shell: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      shell,
      ['-ilc', LOGIN_SHELL_PATH_PROBE],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DISABLE_AUTO_UPDATE: 'true',
          ZSH_TMUX_AUTOSTARTED: 'true',
          ZSH_TMUX_AUTOSTART: 'false'
        },
        timeout: LOGIN_SHELL_TIMEOUT_MS,
        maxBuffer: LOGIN_SHELL_MAX_BUFFER,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }

        resolve(stdout)
      }
    )
  })
}

function toProbeFailure(shell: string, error: unknown): ProbeFailure {
  if (!error || typeof error !== 'object') {
    return { shell }
  }

  const candidate = error as {
    code?: string | number
    signal?: string
    killed?: boolean
  }
  return {
    shell,
    code: candidate.code,
    signal: candidate.signal,
    killed: candidate.killed
  }
}

async function initializeLoginShellPath(): Promise<string | undefined> {
  const startedAt = Date.now()
  const currentPath = process.env.PATH

  if (process.platform === 'win32') {
    logger.debug('shell_environment.login_path_probe_skipped', {
      platform: process.platform,
      currentPathEntryCount: currentPath?.split(delimiter).filter(Boolean).length ?? 0
    })
    return currentPath
  }

  const shells = resolveLoginShellCandidates()
  const failures: ProbeFailure[] = []

  for (const shell of shells) {
    try {
      const stdout = await probeLoginShellPath(shell)
      const loginShellPath = extractPath(stdout)
      if (!loginShellPath) {
        failures.push({ shell, reason: 'invalid_output' })
        continue
      }

      const mergedPath = mergePath(loginShellPath, currentPath)
      process.env.PATH = mergedPath
      logger.info('shell_environment.login_path_probe_succeeded', {
        shell,
        attemptCount: failures.length + 1,
        durationMs: Date.now() - startedAt,
        addedPathEntryCount: countAddedPathEntries(loginShellPath, currentPath),
        loginShellPathEntryCount: loginShellPath.split(delimiter).filter(Boolean).length,
        mergedPathEntryCount: mergedPath.split(delimiter).filter(Boolean).length
      })
      return mergedPath
    } catch (error) {
      failures.push(toProbeFailure(shell, error))
    }
  }

  logger.warn('shell_environment.login_path_probe_failed', {
    candidateCount: shells.length,
    durationMs: Date.now() - startedAt,
    currentPathEntryCount: currentPath?.split(delimiter).filter(Boolean).length ?? 0,
    failures
  })
  return currentPath
}

export function ensureLoginShellPath(): Promise<string | undefined> {
  if (!loginShellPathPromise) {
    loginShellPathPromise = initializeLoginShellPath()
  }

  return loginShellPathPromise
}

export function resetLoginShellPathForTests(): void {
  loginShellPathPromise = null
}
