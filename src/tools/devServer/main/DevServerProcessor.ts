/**
 * DevServer Processor - Backend Implementation
 * Manages development server processes for workspace preview
 */

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type {
  CheckPreviewShArgs,
  CheckPreviewShResponse,
  StartDevServerArgs,
  StartDevServerResponse,
  StopDevServerArgs,
  StopDevServerResponse,
  GetDevServerStatusArgs,
  GetDevServerStatusResponse,
  GetDevServerLogsArgs,
  GetDevServerLogsResponse,
  DevServerProcess
} from '../index.d'

// ============================================
// Constants
// ============================================

const MAX_LOGS = 50
const GRACEFUL_SHUTDOWN_TIMEOUT = 5000 // 5 seconds

// Port detection patterns - only match actual server URLs
const PORT_PATTERNS = [
  /Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i, // Vite: "Local:   http://localhost:5174/"
  /https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i, // Any URL: "http://localhost:3000"
  /server running (?:on|at) https?:\/\/.*?:(\d+)/i, // "server running at http://..."
]

// Error detection patterns
const ERROR_PATTERNS = [
  /EADDRINUSE/i, // Port already in use
  /address already in use/i,
  /Error:/i,
  /ERROR/,
  /FATAL/i,
  /failed/i
]

// ============================================
// DevServerProcessManager Class
// ============================================

class DevServerProcessManager {
  private processes = new Map<string, DevServerProcess>()

  /**
   * Get workspace path for a chatUuid
   */
  private getWorkspacePath(chatUuid: string): string {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'workspaces', chatUuid)
  }

  /**
   * Get preview.sh path for a chatUuid
   */
  private getPreviewShPath(chatUuid: string): string {
    return join(this.getWorkspacePath(chatUuid), 'preview.sh')
  }

  /**
   * Check if preview.sh exists for a workspace
   */
  checkPreviewSh(chatUuid: string): boolean {
    const previewShPath = this.getPreviewShPath(chatUuid)
    return existsSync(previewShPath)
  }

  /**
   * Extract port number from process output
   */
  private extractPort(output: string): number | null {
    // Remove ANSI escape codes (color codes) that might interfere with pattern matching
    // eslint-disable-next-line no-control-regex
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')

    console.log('[DevServer] Original output:', output.substring(0, 100))
    console.log('[DevServer] Cleaned output:', cleanOutput.substring(0, 100))

    for (const pattern of PORT_PATTERNS) {
      const match = cleanOutput.match(pattern)
      if (match && match[1]) {
        const port = parseInt(match[1], 10)
        if (port > 0 && port < 65536) {
          console.log(`[DevServer] ✅ Port extracted: ${port} using pattern: ${pattern}`)
          return port
        }
      }
    }
    console.log('[DevServer] No port found in output')
    return null
  }

  /**
   * Check if output contains error patterns
   */
  private containsError(output: string): boolean {
    return ERROR_PATTERNS.some(pattern => pattern.test(output))
  }

  /**
   * Add log line to process logs (keep last MAX_LOGS lines)
   */
  private addLog(proc: DevServerProcess, line: string): void {
    proc.logs.push(line)
    if (proc.logs.length > MAX_LOGS) {
      proc.logs.shift()
    }
  }

  /**
   * Start development server for a workspace
   */
  async startDevServer(chatUuid: string): Promise<StartDevServerResponse> {
    try {
      // Check if already running
      const existing = this.processes.get(chatUuid)
      if (existing && existing.status !== 'stopped' && existing.status !== 'error') {
        return {
          success: false,
          error: 'Development server is already running or starting'
        }
      }

      // If there's an existing process in error state, kill it first
      if (existing && existing.status === 'error') {
        console.log(`[DevServer] Cleaning up previous process in error state for ${chatUuid}`)
        try {
          const pid = existing.process.pid
          if (pid) {
            this.killProcessTree(pid, 'SIGTERM')
            setTimeout(() => {
              if (!existing.process.killed) {
                this.killProcessTree(pid, 'SIGKILL')
              }
            }, 1000)
          }
        } catch (err) {
          console.error(`[DevServer] Error killing previous process:`, err)
        }
        this.processes.delete(chatUuid)
      }

      // Check if preview.sh exists
      const previewShPath = this.getPreviewShPath(chatUuid)
      if (!existsSync(previewShPath)) {
        return {
          success: false,
          error: 'preview.sh not found in workspace'
        }
      }

      // Get workspace path
      const workspacePath = this.getWorkspacePath(chatUuid)

      console.log(`[DevServer] Starting server for workspace: ${chatUuid}`)
      console.log(`[DevServer] Script path: ${previewShPath}`)
      console.log(`[DevServer] Working directory: ${workspacePath}`)

      // Spawn the process
      // Note: Do NOT use shell: true here, as it causes issues with paths containing spaces
      // Use detached: true on Unix to create a new process group, making it easier to kill all children
      const childProcess: ChildProcess = spawn('bash', [previewShPath], {
        cwd: workspacePath,
        env: {
          ...process.env,
          FORCE_COLOR: '0', // Disable color codes in output
          NODE_ENV: 'development'
        },
        // On Unix, detached creates a new process group
        // On Windows, this is handled differently
        detached: process.platform !== 'win32'
      })

      // Create process record
      const devServerProcess: DevServerProcess = {
        chatUuid,
        process: childProcess,
        status: 'starting',
        port: null,
        logs: [],
        error: null,
        startTime: Date.now()
      }

      this.processes.set(chatUuid, devServerProcess)

      // Handle stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.log(`[DevServer:${chatUuid}] stdout:`, output)

        this.addLog(devServerProcess, output)

        // Try to extract port - always update if found (last valid port wins)
        const port = this.extractPort(output)
        if (port) {
          if (devServerProcess.port && devServerProcess.port !== port) {
            console.log(`[DevServer:${chatUuid}] ✅ Port updated: ${port} [replaced ${devServerProcess.port}]`)
          } else {
            console.log(`[DevServer:${chatUuid}] ✅ Port detected: ${port}`)
          }
          devServerProcess.port = port
          devServerProcess.status = 'running'
        }

        // Check for errors
        if (this.containsError(output)) {
          console.error(`[DevServer:${chatUuid}] Error detected in output:`, output)
          devServerProcess.status = 'error'
          devServerProcess.error = output.trim()
        }
      })

      // Handle stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.error(`[DevServer:${chatUuid}] stderr:`, output)

        this.addLog(devServerProcess, `[stderr] ${output}`)

        // Try to extract port from stderr (some servers output to stderr)
        const port = this.extractPort(output)
        if (port) {
          if (devServerProcess.port && devServerProcess.port !== port) {
            console.log(`[DevServer:${chatUuid}] ✅ Port updated from stderr: ${port} [replaced ${devServerProcess.port}]`)
          } else {
            console.log(`[DevServer:${chatUuid}] ✅ Port detected in stderr: ${port}`)
          }
          devServerProcess.port = port
          devServerProcess.status = 'running'
        }

        // Check for errors
        if (this.containsError(output)) {
          console.error(`[DevServer:${chatUuid}] Error detected in stderr:`, output)
          devServerProcess.status = 'error'
          devServerProcess.error = output.trim()
        }
      })

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        console.log(`[DevServer:${chatUuid}] Process exited with code ${code}, signal ${signal}`)

        if (devServerProcess.status !== 'stopped') {
          devServerProcess.status = 'error'
          devServerProcess.error = `Process exited unexpectedly with code ${code}`
          this.addLog(devServerProcess, `Process exited with code ${code}`)
        }
      })

      // Handle process errors
      childProcess.on('error', (err) => {
        console.error(`[DevServer:${chatUuid}] Process error:`, err)
        devServerProcess.status = 'error'
        devServerProcess.error = err.message
        this.addLog(devServerProcess, `Process error: ${err.message}`)
      })

      console.log(`[DevServer:${chatUuid}] Process spawned successfully, waiting for port detection...`)
      console.log(`[DevServer:${chatUuid}] Logs will be captured and analyzed for port information`)

      return {
        success: true,
        message: 'Development server started successfully'
      }
    } catch (error: any) {
      console.error(`[DevServer] Failed to start server for ${chatUuid}:`, error)
      return {
        success: false,
        error: error.message || 'Failed to start development server'
      }
    }
  }

  /**
   * Kill process tree recursively
   */
  private killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    try {
      // On Unix systems, kill the entire process group by using negative PID
      // This ensures all child processes (npm, vite, etc.) are killed
      console.log(`[DevServer] Killing process tree for PID ${pid} with signal ${signal}`)

      if (process.platform === 'win32') {
        // Windows: use taskkill to kill process tree
        require('child_process').execSync(`taskkill /pid ${pid} /T /F`)
      } else {
        // Unix: kill process group (-pid kills all processes in the group)
        try {
          process.kill(-pid, signal)
          console.log(`[DevServer] Successfully killed process group -${pid}`)
        } catch (err) {
          // If process group kill fails, try killing the process directly
          console.log(`[DevServer] Process group kill failed, trying direct kill`)
          process.kill(pid, signal)
        }
      }
    } catch (error) {
      console.error(`[DevServer] Error killing process tree:`, error)
    }
  }

  /**
   * Stop development server for a workspace
   */
  async stopDevServer(chatUuid: string): Promise<StopDevServerResponse> {
    try {
      const proc = this.processes.get(chatUuid)

      if (!proc) {
        return {
          success: false,
          error: 'No development server found for this workspace'
        }
      }

      if (proc.status === 'stopped') {
        return {
          success: true,
          message: 'Development server already stopped'
        }
      }

      console.log(`[DevServer] Stopping server for workspace: ${chatUuid}`)

      const childProcess = proc.process
      const pid = childProcess.pid

      if (!pid) {
        console.error(`[DevServer] No PID found for process`)
        return {
          success: false,
          error: 'No PID found for process'
        }
      }

      // Try graceful shutdown first - kill entire process tree
      this.killProcessTree(pid, 'SIGTERM')
      proc.status = 'stopped'

      // Force kill after timeout
      setTimeout(() => {
        if (!childProcess.killed) {
          console.log(`[DevServer:${chatUuid}] Forcing kill after timeout`)
          this.killProcessTree(pid, 'SIGKILL')
        }
      }, GRACEFUL_SHUTDOWN_TIMEOUT)

      // Clean up process record
      this.processes.delete(chatUuid)

      return {
        success: true,
        message: 'Development server stopped successfully'
      }
    } catch (error: any) {
      console.error(`[DevServer] Failed to stop server for ${chatUuid}:`, error)
      return {
        success: false,
        error: error.message || 'Failed to stop development server'
      }
    }
  }

  /**
   * Get development server status
   */
  getStatus(chatUuid: string): GetDevServerStatusResponse {
    const proc = this.processes.get(chatUuid)

    if (!proc) {
      return {
        success: true,
        status: 'idle',
        port: null,
        logs: [],
        error: null
      }
    }

    return {
      success: true,
      status: proc.status,
      port: proc.port,
      logs: [...proc.logs], // Return copy
      error: proc.error
    }
  }

  /**
   * Get development server logs
   */
  getLogs(chatUuid: string, limit: number = MAX_LOGS): GetDevServerLogsResponse {
    const proc = this.processes.get(chatUuid)

    if (!proc) {
      return {
        success: true,
        logs: []
      }
    }

    const logs = proc.logs.slice(-limit)

    return {
      success: true,
      logs
    }
  }

  /**
   * Stop all development servers
   */
  stopAll(): void {
    console.log(`[DevServer] Stopping all development servers...`)

    for (const [chatUuid, proc] of this.processes.entries()) {
      try {
        if (proc.status !== 'stopped') {
          console.log(`[DevServer] Stopping server for ${chatUuid}`)
          const pid = proc.process.pid

          if (pid) {
            this.killProcessTree(pid, 'SIGTERM')

            setTimeout(() => {
              if (!proc.process.killed) {
                this.killProcessTree(pid, 'SIGKILL')
              }
            }, GRACEFUL_SHUTDOWN_TIMEOUT)
          }
        }
      } catch (error) {
        console.error(`[DevServer] Error stopping server for ${chatUuid}:`, error)
      }
    }

    this.processes.clear()
    console.log(`[DevServer] All servers stopped`)
  }
}

// ============================================
// Singleton Instance
// ============================================

const devServerManager = new DevServerProcessManager()

// ============================================
// IPC Handler Functions
// ============================================

export async function processCheckPreviewSh(
  args: CheckPreviewShArgs
): Promise<CheckPreviewShResponse> {
  try {
    const { chatUuid } = args
    const exists = devServerManager.checkPreviewSh(chatUuid)

    return {
      success: true,
      exists
    }
  } catch (error: any) {
    console.error('[DevServer] processCheckPreviewSh error:', error)
    return {
      success: false,
      exists: false,
      error: error.message || 'Failed to check preview.sh'
    }
  }
}

export async function processStartDevServer(
  args: StartDevServerArgs
): Promise<StartDevServerResponse> {
  return devServerManager.startDevServer(args.chatUuid)
}

export async function processStopDevServer(
  args: StopDevServerArgs
): Promise<StopDevServerResponse> {
  return devServerManager.stopDevServer(args.chatUuid)
}

export async function processGetDevServerStatus(
  args: GetDevServerStatusArgs
): Promise<GetDevServerStatusResponse> {
  return devServerManager.getStatus(args.chatUuid)
}

export async function processGetDevServerLogs(
  args: GetDevServerLogsArgs
): Promise<GetDevServerLogsResponse> {
  const { chatUuid, limit } = args
  return devServerManager.getLogs(chatUuid, limit)
}

export function cleanupDevServers(): void {
  devServerManager.stopAll()
}
