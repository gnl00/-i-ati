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
import type {
  ExecuteCommandArgs,
  ExecuteCommandResponse,
  RiskLevel
} from '@tools/command/index.d'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

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
  console.warn(`[CommandExecutor] Relative workspace path detected, rebasing to userData: ${workspacePath}`)
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
    console.error('[CommandExecutor] Failed to resolve workspace path from DB:', error)
  }

  return join(userDataPath, 'workspaces', chatUuid)
}

// 危险命令模式（需要用户确认）
const DANGEROUS_PATTERNS = [
  // 文件删除相关
  { pattern: /rm\s+-rf\s+[\/~]/i, reason: 'Recursive deletion from root or home directory' },
  { pattern: /rm\s+-rf\s+\*/i, reason: 'Recursive deletion with wildcard' },
  { pattern: /rm\s+.*\s+-rf/i, reason: 'Recursive file deletion' },

  // 磁盘操作
  { pattern: /dd\s+if=/i, reason: 'Direct disk write operation' },
  { pattern: /mkfs/i, reason: 'File system formatting' },
  { pattern: /fdisk/i, reason: 'Disk partitioning' },

  // 设备文件操作
  { pattern: />\s*\/dev\/(sd|hd|nvme)/i, reason: 'Writing to disk device' },

  // 权限相关
  { pattern: /chmod\s+-R\s+777/i, reason: 'Setting world-writable permissions recursively' },
  { pattern: /chown\s+-R/i, reason: 'Changing ownership recursively' },

  // Sudo 操作
  { pattern: /sudo\s+rm/i, reason: 'Deleting files with sudo' },
  { pattern: /sudo\s+dd/i, reason: 'Disk operation with sudo' },

  // 系统关键目录
  { pattern: /rm.*\/etc/i, reason: 'Deleting system configuration files' },
  { pattern: /rm.*\/usr/i, reason: 'Deleting system binaries' },
  { pattern: /rm.*\/var/i, reason: 'Deleting system data' },

  // Fork bomb 和恶意命令
  { pattern: /:\(\)\{.*:\|:.*\};:/i, reason: 'Fork bomb detected' },
  { pattern: /while\s+true.*do/i, reason: 'Infinite loop detected' }
]

// 警告级别命令模式
const WARNING_PATTERNS = [
  { pattern: /rm\s+-r/i, reason: 'Recursive deletion' },
  { pattern: /rm\s+.*\*/i, reason: 'Deletion with wildcard' },
  { pattern: /git\s+push\s+.*--force/i, reason: 'Force push to git repository' },
  { pattern: /npm\s+publish/i, reason: 'Publishing to npm registry' },
  { pattern: /curl.*\|\s*bash/i, reason: 'Executing downloaded script' },
  { pattern: /wget.*\|\s*sh/i, reason: 'Executing downloaded script' },
  { pattern: />\s*\/dev\/null/i, reason: 'Redirecting to /dev/null' }
]

// ============================================
// Risk Assessment (shared)
// ============================================

export function assessCommandRisk(command: string): { level: RiskLevel; reason?: string } {
  // 检查危险命令
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      console.log(`[CommandExecutor] Dangerous command detected: ${reason}`)
      return { level: 'dangerous', reason }
    }
  }

  // 检查警告级别命令
  for (const { pattern, reason } of WARNING_PATTERNS) {
    if (pattern.test(command)) {
      console.log(`[CommandExecutor] Warning command detected: ${reason}`)
      return { level: 'warning', reason }
    }
  }

  return { level: 'safe' }
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
    console.log(`[CommandExecutor] Workspace base path set to: ${this.workspaceBasePath}`)
  }

  /**
   * 评估命令风险等级
   */
  private assessRisk(command: string): { level: RiskLevel; reason?: string } {
    return assessCommandRisk(command)
  }

  /**
   * 解析工作目录
   */
  private resolveWorkingDirectory(cwd?: string, workspaceBasePath: string | null = this.workspaceBasePath): string {
    // 如果没有设置 workspace base path，使用当前工作目录
    if (!workspaceBasePath) {
      console.log('[CommandExecutor] No workspace base path set, using process.cwd()')
      return cwd ? resolve(process.cwd(), cwd) : process.cwd()
    }

    // 如果没有指定 cwd，使用 workspace base path
    if (!cwd) {
      return workspaceBasePath
    }

    // 如果 cwd 是绝对路径，检查是否在 workspace 内
    if (isAbsolute(cwd)) {
      if (!cwd.startsWith(workspaceBasePath)) {
        console.warn(`[CommandExecutor] Absolute path outside workspace: ${cwd}`)
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
        console.log(`[CommandExecutor] Using shell: ${shell}`)
        return await execAsync(command, { ...options, shell })
      } catch (error: any) {
        lastError = error
        const code = typeof error?.code === 'string' ? error.code : undefined
        const message = typeof error?.message === 'string' ? error.message : ''
        if (code === 'ENOENT' || message.includes('ENOENT')) {
          console.warn(`[CommandExecutor] Shell not found, retrying: ${shell}`)
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
    const { command, cwd, timeout = DEFAULT_TIMEOUT, env, confirmed = false, chat_uuid } = args

    console.log(`[CommandExecutor] Executing command: ${command}`)
    console.log(`[CommandExecutor] CWD: ${cwd || 'workspace root'}`)
    console.log(`[CommandExecutor] Timeout: ${timeout}ms`)

    try {
      // 1. 评估命令风险
      const riskAssessment = this.assessRisk(command)
      console.log(`[CommandExecutor] Risk level: ${riskAssessment.level}`)

      // 2. 如果是危险或警告级别命令，且未确认，则要求确认
      if ((riskAssessment.level === 'dangerous' || riskAssessment.level === 'warning') && !confirmed) {
        console.log(`[CommandExecutor] Command requires user confirmation`)
        return {
          success: false,
          command,
          requires_confirmation: true,
          risk_level: riskAssessment.level,
          risk_reason: riskAssessment.reason,
          error: 'This command requires user confirmation before execution'
        }
      }

      // 3. 解析工作目录
      const workspaceBasePath = chat_uuid ? resolveWorkspaceBaseDir(chat_uuid) : this.workspaceBasePath
      if (chat_uuid) {
        console.log(`[CommandExecutor] Workspace base path resolved for chat ${chat_uuid}: ${workspaceBasePath}`)
      }
      const workingDir = this.resolveWorkingDirectory(cwd, workspaceBasePath)
      console.log(`[CommandExecutor] Resolved working directory: ${workingDir}`)
      if (!existsSync(workingDir)) {
        try {
          mkdirSync(workingDir, { recursive: true })
          console.log(`[CommandExecutor] Created working directory: ${workingDir}`)
        } catch (error) {
          console.warn(`[CommandExecutor] Failed to create working directory: ${workingDir}`, error)
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

      console.log(`[CommandExecutor] Command completed successfully in ${executionTime}ms`)

      return {
        success: true,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exit_code: 0,
        execution_time: executionTime
      }
    } catch (error: any) {
      const executionTime = Date.now() - Date.now()
      console.error(`[CommandExecutor] Command failed:`, error.message)

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
