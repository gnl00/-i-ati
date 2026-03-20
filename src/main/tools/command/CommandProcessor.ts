/**
 * Command Processor - Backend Implementation
 * 处理命令执行的主进程逻辑
 */

import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { resolve, isAbsolute, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { createLogger } from '@main/services/logging/LogService'
import type {
  ExecuteCommandArgs,
  ExecuteCommandResponse
} from '@tools/command/index.d'
import { assessExecuteCommandReview } from './risk'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const logger = createLogger('CommandExecutor')

// ============================================
// Constants
// ============================================

const DEFAULT_TIMEOUT = 30000 // 30 seconds
const MAX_BUFFER = 10 * 1024 * 1024 // 10MB
const DEFAULT_WORKSPACE_NAME = 'tmp'

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

function resolveWorkspaceBaseDir(chatUuid?: string): string {
  const userDataPath = app.getPath('userData')

  if (!chatUuid) {
    return join(userDataPath, 'workspaces', DEFAULT_WORKSPACE_NAME)
  }

  try {
    const workspacePath = DatabaseService.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return normalizeWorkspaceBaseDir(workspacePath, chatUuid)
    }
  } catch (error) {
    logger.error('workspace.resolve_from_db_failed', error)
  }

  return join(userDataPath, 'workspaces', chatUuid)
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

    return [
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
      '/usr/bin/zsh',
      '/usr/bin/bash',
      '/usr/bin/sh'
    ].filter((value): value is string => Boolean(value))
  }

  private async execWithShells(
    command: string,
    options: {
      cwd: string
      timeout: number
      env: Record<string, string>
      maxBuffer: number
    }
  ) {
    const shells = this.resolveShellCandidates()
    if (shells.length === 0) {
      return execAsync(command, options)
    }

    let lastError: any
    for (const shell of shells) {
      try {
        logger.debug('command.using_shell', { shell })
        return await execAsync(command, { ...options, shell })
      } catch (error: any) {
        lastError = error
        const code = typeof error?.code === 'string' ? error.code : undefined
        const message = typeof error?.message === 'string' ? error.message : ''
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

  private resolveExecutable(bin: string, env: Record<string, string>): string | null {
    if (isAbsolute(bin)) {
      return bin
    }
    const pathValue = env.PATH || process.env.PATH || ''
    const parts = pathValue.split(':').filter(Boolean)
    for (const part of parts) {
      const candidate = join(part, bin)
      if (candidate && existsSync(candidate)) {
        return candidate
      }
    }
    return null
  }

  /**
   * 执行命令
   */
  async executeCommand(args: ExecuteCommandArgs): Promise<ExecuteCommandResponse> {
    const {
      command,
      execution_reason,
      possible_risk,
      risk_score,
      cwd,
      timeout = DEFAULT_TIMEOUT,
      env,
      confirmed = false,
      chat_uuid
    } = args

    logger.info('command.execute_start', {
      command,
      cwd: cwd || 'workspace root',
      timeout,
      chatUuid: chat_uuid
    })

    try {
      // 1. 评估命令风险
      const riskAssessment = assessExecuteCommandReview({ command, possible_risk, risk_score })
      logger.info('command.risk_assessed', {
        command,
        riskLevel: riskAssessment.level,
        riskScore: riskAssessment.normalizedRiskScore
      })

      // 2. 如果是危险或警告级别命令，且未确认，则要求确认
      if ((riskAssessment.level === 'dangerous' || riskAssessment.level === 'warning') && !confirmed) {
        logger.info('command.requires_confirmation', {
          command,
          riskLevel: riskAssessment.level
        })
        return {
          success: false,
          command,
          requires_confirmation: true,
          risk_level: riskAssessment.level,
          risk_reason: riskAssessment.reason,
          execution_reason,
          possible_risk,
          risk_score: riskAssessment.normalizedRiskScore,
          error: 'This command requires user confirmation before execution'
        }
      }

      // 3. 解析工作目录
      const workspaceBasePath = chat_uuid ? resolveWorkspaceBaseDir(chat_uuid) : this.workspaceBasePath
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

      // 4. 准备环境变量
      const execEnv = {
        ...process.env,
        ...env,
        FORCE_COLOR: '0' // 禁用颜色代码
      }

      // 5. 执行命令
      const startTime = Date.now()
      let stdout = ''
      let stderr = ''
      if (this.isSimpleCommand(command)) {
        const tokens = command.trim().split(/\s+/)
        const bin = tokens[0]
        const args = tokens.slice(1)
        const resolvedBin = this.resolveExecutable(bin, execEnv)
        const execFileTarget = resolvedBin || bin
        try {
          const result = await execFileAsync(execFileTarget, args, {
            cwd: workingDir,
            timeout,
            env: execEnv,
            maxBuffer: MAX_BUFFER
          })
          stdout = result.stdout ?? ''
          stderr = result.stderr ?? ''
        } catch (error) {
          throw error
        }
      } else {
        const result = await this.execWithShells(command, {
          cwd: workingDir,
          timeout,
          env: execEnv,
          maxBuffer: MAX_BUFFER
        })
        stdout = result.stdout ?? ''
        stderr = result.stderr ?? ''
      }

      const executionTime = Date.now() - startTime

      logger.info('command.execute_success', {
        command,
        executionTime,
        stdoutLength: stdout.length,
        stderrLength: stderr.length
      })

      return {
        success: true,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exit_code: 0,
        execution_time: executionTime
      }
    } catch (error: any) {
      const executionTime = 0
      logger.error('command.execute_failed', {
        command,
        error: error.message,
        code: error.code,
        killed: error.killed,
        signal: error.signal
      })

      // 处理超时错误
      if (error.killed && error.signal === 'SIGTERM') {
        return {
          success: false,
          command,
          stdout: error.stdout?.trim() || '',
          stderr: error.stderr?.trim() || '',
          exit_code: error.code || -1,
          execution_time: timeout,
          error: `Command timeout after ${timeout}ms`
        }
      }

      // 处理其他执行错误
      return {
        success: false,
        command,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || '',
        exit_code: error.code || -1,
        execution_time: executionTime,
        error: error.message
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
  args: ExecuteCommandArgs
): Promise<ExecuteCommandResponse> {
  return commandExecutor.executeCommand(args)
}

/**
 * 设置 workspace 基础路径
 */
export function setCommandWorkspaceBasePath(path: string): void {
  commandExecutor.setWorkspaceBasePath(path)
}
