/**
 * Command Processor - Backend Implementation
 * 处理命令执行的主进程逻辑
 */

import { resolve, isAbsolute, join, delimiter, extname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import { createLogger } from '@main/logging/LogService'
import { AbortError } from '@main/agent/contracts'
import { ensureLoginShellPath } from '@main/services/shellEnvironment'
import { resolveWorkspaceRoot } from '@main/services/filesystem/WorkspacePathResolver'
import {
  CommandProcessSpawnError,
  runCommandProcess,
  type CommandProcessRunOptions,
  type CommandProcessRunResult
} from '@main/services/command/CommandProcessRunner'
import type { EmbeddedToolExecutionContext } from '@shared/tools/registry'
import type {
  ExecuteCommandArgs,
  ExecuteCommandResponse
} from '@tools/command/index.d'
import { assessCommandFilesystemScope } from './filesystemScope'
import { assessExecuteCommandReview } from './risk'

const logger = createLogger('CommandExecutor')

// ============================================
// Constants
// ============================================

const DEFAULT_TIMEOUT = 30000 // 30 seconds
const MIN_TIMEOUT = 1
const MAX_TIMEOUT = 24 * 60 * 60 * 1000
const DEFAULT_WORKSPACE_NAME = 'tmp'

function normalizeCommandTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT
  }
  return Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, Math.floor(value)))
}

const WINDOWS_COMMAND_META_CHARACTER = /([()\][%!^"`<>&|;, *?])/g

function escapeWindowsCommand(value: string): string {
  if (/[\r\n\0]/.test(value)) {
    throw new Error('Windows command arguments cannot contain line breaks or null bytes')
  }
  return value.replace(WINDOWS_COMMAND_META_CHARACTER, '^$1')
}

function escapeWindowsCommandArgument(value: string, doubleEscapeMeta: boolean): string {
  if (/[\r\n\0]/.test(value)) {
    throw new Error('Windows command arguments cannot contain line breaks or null bytes')
  }

  let escaped = value
    .replace(/(?=(\\+?)?)\1"/g, '$1$1\\"')
    .replace(/(?=(\\+?)?)\1$/, '$1$1')
  escaped = `"${escaped}"`.replace(WINDOWS_COMMAND_META_CHARACTER, '^$1')
  return doubleEscapeMeta
    ? escaped.replace(WINDOWS_COMMAND_META_CHARACTER, '^$1')
    : escaped
}

export interface ExecuteCommandInvocation {
  executable: string
  args: string[]
}

async function ensureLoginShellPathForCommand(signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await ensureLoginShellPath()
    return
  }
  if (signal.aborted) {
    throw new AbortError('Command execution aborted')
  }

  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = (): void => reject(new AbortError('Command execution aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
  })

  try {
    await Promise.race([ensureLoginShellPath(), aborted])
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

function normalizeWorkspaceBaseDir(workspacePath: string, chatUuid?: string): string {
  const userDataPath = app.getPath('userData')
  const fallbackDir = join(userDataPath, 'workspaces', chatUuid || DEFAULT_WORKSPACE_NAME)

  if (!workspacePath) {
    return fallbackDir
  }

  if (isAbsolute(workspacePath)) {
    return resolve(workspacePath)
  }

  const normalized = workspacePath.replace(/\\/g, '/')
  const clean = normalized.startsWith('./') ? normalized.slice(2) : normalized

  if (clean.startsWith('workspaces/')) {
    return resolve(join(userDataPath, clean))
  }

  // Defensive fallback: prevent relative workspace paths from binding to process.cwd()
  logger.warn('workspace.relative_path_rebased', { workspacePath })
  return resolve(join(userDataPath, clean))
}

// ============================================
// CommandExecutor Class
// ============================================

class CommandExecutor {
  private workspaceBasePath: string | null = null

  /**
   * 设置 workspace 基础路径
   */
  setWorkspaceBasePath(path: string): void {
    this.workspaceBasePath = normalizeWorkspaceBaseDir(path)
    logger.info('workspace.base_path_set', { workspaceBasePath: this.workspaceBasePath })
  }

  /**
   * 解析工作目录
   */
  private resolveWorkingDirectory(cwd?: string, workspaceBasePath: string | null = this.workspaceBasePath): string {
    // 如果没有设置 workspace base path，使用当前工作目录
    if (!workspaceBasePath) {
      logger.debug('workspace.base_path_missing_use_cwd')
      return cwd ? resolve(process.cwd(), cwd) : process.cwd()
    }

    // 如果没有指定 cwd，使用 workspace base path
    if (!cwd) {
      return workspaceBasePath
    }

    // 如果 cwd 是绝对路径，检查是否在 workspace 内
    if (isAbsolute(cwd)) {
      if (!cwd.startsWith(workspaceBasePath)) {
        logger.warn('workspace.absolute_path_outside_base', { cwd, workspaceBasePath })
      }
      return cwd
    }

    // 相对路径，相对于 workspace base path
    return resolve(workspaceBasePath, cwd)
  }

  private resolveShellCandidates(): string[] {
    if (process.platform === 'win32') {
      return [process.env.COMSPEC, 'cmd.exe'].filter((value): value is string => Boolean(value))
    }

    return Array.from(new Set([
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
      '/usr/bin/zsh',
      '/usr/bin/bash',
      '/usr/bin/sh'
    ].filter((value): value is string => Boolean(value))))
  }

  private async runWithShells(
    command: string,
    options: Omit<CommandProcessRunOptions, 'executable' | 'args'>
  ): Promise<CommandProcessRunResult> {
    const shells = this.resolveShellCandidates()

    let lastError: unknown
    for (const shell of shells) {
      try {
        logger.debug('command.using_shell', { shell })
        const shellArgs = process.platform === 'win32'
          ? ['/d', '/s', '/c', command]
          : ['-c', command]
        return await runCommandProcess({
          ...options,
          executable: shell,
          args: shellArgs
        })
      } catch (error: unknown) {
        lastError = error
        const code = error instanceof CommandProcessSpawnError ? error.code : undefined
        const message = error instanceof Error ? error.message : ''
        if (code === 'ENOENT' || message.includes('ENOENT')) {
          logger.warn('command.shell_not_found_retry', { shell })
          continue
        }
        throw error
      }
    }

    throw lastError
  }

  private async runWindowsCommandInvocation(
    executable: string,
    args: string[],
    options: Omit<CommandProcessRunOptions, 'executable' | 'args'>
  ): Promise<CommandProcessRunResult> {
    const doubleEscapeMeta = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(executable)
    const shellCommand = [
      escapeWindowsCommand(executable),
      ...args.map(value => escapeWindowsCommandArgument(value, doubleEscapeMeta))
    ].join(' ')

    let lastError: unknown
    for (const shell of this.resolveShellCandidates()) {
      try {
        return await runCommandProcess({
          ...options,
          executable: shell,
          args: ['/d', '/s', '/c', `"${shellCommand}"`],
          windowsVerbatimArguments: true
        })
      } catch (error: unknown) {
        lastError = error
        const code = error instanceof CommandProcessSpawnError ? error.code : undefined
        const message = error instanceof Error ? error.message : ''
        if (code === 'ENOENT' || message.includes('ENOENT')) {
          logger.warn('command.shell_not_found_retry', { shell })
          continue
        }
        throw error
      }
    }

    throw lastError
  }

  private isSimpleCommand(command: string): boolean {
    return /^[\w./-]+(\s+[\w./-]+)*$/.test(command.trim())
  }

  private resolveExecutable(bin: string, env: NodeJS.ProcessEnv): string | null {
    if (isAbsolute(bin)) {
      return bin
    }
    const pathValue = env.PATH || process.env.PATH || ''
    const parts = pathValue.split(delimiter).filter(Boolean)
    const extensions = process.platform === 'win32' && extname(bin).length === 0
      ? (env.PATHEXT || process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .filter(Boolean)
      : ['']
    for (const part of parts) {
      for (const extension of extensions) {
        const candidate = join(part, `${bin}${extension}`)
        if (candidate && existsSync(candidate)) {
          return candidate
        }
      }
    }
    return null
  }

  /**
   * 执行命令
   */
  async executeCommand(
    args: ExecuteCommandArgs,
    context?: EmbeddedToolExecutionContext,
    invocation?: ExecuteCommandInvocation
  ): Promise<ExecuteCommandResponse> {
    const {
      command,
      execution_reason,
      possible_risk,
      risk_score,
      cwd,
      timeout: requestedTimeout,
      env,
      confirmed = false,
      chat_uuid
    } = args
    const timeout = normalizeCommandTimeout(requestedTimeout)

    logger.info('command.execute_start', {
      command,
      cwd: cwd || 'workspace root',
      timeout,
      chatUuid: chat_uuid
    })

    try {
      // 1. 评估命令风险
      const riskAssessment = assessExecuteCommandReview({ command, possible_risk, risk_score })
      const workspaceBasePath = chat_uuid
        ? resolveWorkspaceRoot(chat_uuid)
        : this.workspaceBasePath ?? resolveWorkspaceRoot()
      const filesystemScopeAssessment = assessCommandFilesystemScope({
        command,
        filesystem_scope: args.filesystem_scope,
        filesystem_scope_reason: args.filesystem_scope_reason,
        cwd,
        env,
        workspaceRoot: workspaceBasePath
      })
      logger.info('command.risk_assessed', {
        command,
        riskLevel: riskAssessment.level,
        riskScore: riskAssessment.normalizedRiskScore,
        filesystemScope: filesystemScopeAssessment.declaredScope,
        inferredFilesystemScope: filesystemScopeAssessment.inferredScope
      })

      // 2. 如果是危险或警告级别命令，且未确认，则要求确认
      if ((riskAssessment.level === 'dangerous' || riskAssessment.level === 'warning' || filesystemScopeAssessment.requiresConfirmation) && !confirmed) {
        logger.info('command.requires_confirmation', {
          command,
          riskLevel: riskAssessment.level,
          filesystemScope: filesystemScopeAssessment.declaredScope,
          inferredFilesystemScope: filesystemScopeAssessment.inferredScope
        })
        return {
          success: false,
          command,
          requires_confirmation: true,
          risk_level: riskAssessment.level,
          risk_reason: riskAssessment.reason,
          filesystem_scope: filesystemScopeAssessment.declaredScope,
          filesystem_scope_reason: filesystemScopeAssessment.reason,
          execution_reason,
          possible_risk,
          risk_score: riskAssessment.normalizedRiskScore,
          error: 'This command requires user confirmation before execution'
        }
      }

      // 3. 解析工作目录
      if (chat_uuid) {
        logger.debug('workspace.base_path_resolved_for_chat', { chatUuid: chat_uuid, workspaceBasePath })
      }
      const workingDir = this.resolveWorkingDirectory(cwd, workspaceBasePath)
      logger.info('workspace.working_directory_resolved', { workingDir, chatUuid: chat_uuid })
      if (!existsSync(workingDir)) {
        try {
          mkdirSync(workingDir, { recursive: true })
          logger.info('workspace.working_directory_created', { workingDir })
        } catch (error) {
          logger.warn('workspace.working_directory_create_failed', { workingDir, error })
        }
      }

      // 4. 补全 Electron 启动环境缺失的 login shell PATH
      await ensureLoginShellPathForCommand(context?.signal)

      // 5. 准备环境变量
      const execEnv = {
        ...process.env,
        ...env,
        FORCE_COLOR: '0' // 禁用颜色代码
      }

      // 6. 执行命令
      let result: CommandProcessRunResult
      const runOptions = {
        cwd: workingDir,
        timeoutMs: timeout,
        env: execEnv,
        signal: context?.signal,
        onOutput: context?.onOutput
      }
      if (invocation) {
        const resolvedExecutable = this.resolveExecutable(invocation.executable, execEnv)
          || invocation.executable
        const executableExtension = extname(resolvedExecutable).toLowerCase()
        result = process.platform === 'win32'
          && (executableExtension === '.cmd' || executableExtension === '.bat')
          ? await this.runWindowsCommandInvocation(
              resolvedExecutable,
              invocation.args,
              runOptions
            )
          : await runCommandProcess({
              ...runOptions,
              executable: resolvedExecutable,
              args: invocation.args
            })
      } else if (this.isSimpleCommand(command)) {
        const tokens = command.trim().split(/\s+/)
        const bin = tokens[0]
        const commandArgs = tokens.slice(1)
        const resolvedBin = this.resolveExecutable(bin, execEnv)
        const executable = resolvedBin || bin
        const executableExtension = extname(executable).toLowerCase()
        result = process.platform === 'win32'
          && (executableExtension === '.cmd' || executableExtension === '.bat')
          ? await this.runWithShells(command, runOptions)
          : await runCommandProcess({
              ...runOptions,
              executable,
              args: commandArgs
            })
      } else {
        result = await this.runWithShells(command, runOptions)
      }

      if (result.aborted) {
        logger.info('command.execute_aborted', {
          command,
          executionTime: result.executionTimeMs,
          terminationSignal: result.terminationSignal,
          stdoutBytes: result.stdoutBytes,
          stderrBytes: result.stderrBytes
        })
        throw new AbortError('Command execution aborted')
      }

      const success = result.exitCode === 0
        && result.terminationSignal === null
        && !result.timedOut

      logger.info(success ? 'command.execute_success' : 'command.execute_failed', {
        command,
        executionTime: result.executionTimeMs,
        exitCode: result.exitCode,
        terminationSignal: result.terminationSignal,
        timedOut: result.timedOut,
        aborted: false,
        stdoutBytes: result.stdoutBytes,
        stderrBytes: result.stderrBytes,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated
      })

      return {
        success,
        command,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        stdout_bytes: result.stdoutBytes,
        stderr_bytes: result.stderrBytes,
        stdout_truncated: result.stdoutTruncated,
        stderr_truncated: result.stderrTruncated,
        exit_code: result.exitCode ?? -1,
        termination_signal: result.terminationSignal ?? undefined,
        execution_time: result.executionTimeMs,
        error: result.timedOut
          ? `Command timeout after ${timeout}ms`
          : success
            ? undefined
            : result.terminationSignal
              ? `Command terminated by ${result.terminationSignal}`
              : `Command failed with exit code ${result.exitCode ?? -1}`
      }
    } catch (error: unknown) {
      if (error instanceof AbortError) {
        throw error
      }
      const candidate = error instanceof CommandProcessSpawnError ? error.result : undefined
      const message = error instanceof Error ? error.message : String(error)
      const code = error instanceof CommandProcessSpawnError ? error.code : undefined
      logger.error('command.execute_failed', {
        command,
        error: message,
        code,
        signal: candidate?.terminationSignal
      })

      return {
        success: false,
        command,
        stdout: candidate?.stdout.trim() || '',
        stderr: candidate?.stderr.trim() || '',
        stdout_bytes: candidate?.stdoutBytes ?? 0,
        stderr_bytes: candidate?.stderrBytes ?? 0,
        stdout_truncated: candidate?.stdoutTruncated ?? false,
        stderr_truncated: candidate?.stderrTruncated ?? false,
        exit_code: typeof code === 'number' ? code : -1,
        termination_signal: candidate?.terminationSignal ?? undefined,
        execution_time: candidate?.executionTimeMs ?? 0,
        error: message
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

const commandExecutor = new CommandExecutor()

// ============================================
// IPC Handler Functions
// ============================================

/**
 * 处理命令执行请求
 */
export async function processExecuteCommand(
  args: ExecuteCommandArgs,
  context?: EmbeddedToolExecutionContext,
  invocation?: ExecuteCommandInvocation
): Promise<ExecuteCommandResponse> {
  return commandExecutor.executeCommand(args, context, invocation)
}

/**
 * 设置 workspace 基础路径
 */
export function setCommandWorkspaceBasePath(path: string): void {
  commandExecutor.setWorkspaceBasePath(path)
}
