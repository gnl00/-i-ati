/**
 * Command Processor - Backend Implementation
 * 处理命令执行的主进程逻辑
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { resolve, isAbsolute, join } from 'path'
import { app } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import type {
  ExecuteCommandArgs,
  ExecuteCommandResponse,
  RiskLevel
} from '@tools/command/index.d'

const execAsync = promisify(exec)

// ============================================
// Constants
// ============================================

const DEFAULT_TIMEOUT = 30000 // 30 seconds
const MAX_BUFFER = 10 * 1024 * 1024 // 10MB
const DEFAULT_WORKSPACE_NAME = 'tmp'

function resolveWorkspaceBaseDir(chatUuid?: string): string {
  const userDataPath = app.getPath('userData')

  if (!chatUuid) {
    return join(userDataPath, 'workspaces', DEFAULT_WORKSPACE_NAME)
  }

  try {
    const workspacePath = DatabaseService.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return workspacePath
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
  { pattern: />\s*\/dev\/null/i, reason: 'Redirecting to /dev/null' },

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
  { pattern: /wget.*\|\s*sh/i, reason: 'Executing downloaded script' }
]

// ============================================
// CommandExecutor Class
// ============================================

class CommandExecutor {
  private workspaceBasePath: string | null = null

  /**
   * 设置 workspace 基础路径
   */
  setWorkspaceBasePath(path: string): void {
    this.workspaceBasePath = path
    console.log(`[CommandExecutor] Workspace base path set to: ${path}`)
  }

  /**
   * 评估命令风险等级
   */
  private assessRisk(command: string): { level: RiskLevel; reason?: string } {
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

      // 4. 准备环境变量
      const execEnv = {
        ...process.env,
        ...env,
        FORCE_COLOR: '0' // 禁用颜色代码
      }

      // 5. 执行命令
      const startTime = Date.now()
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout,
        env: execEnv,
        maxBuffer: MAX_BUFFER
      })

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
