/**
 * DevServer Processor - Backend Implementation
 * Manages development server processes for workspace preview
 */

import { spawn, type ChildProcess, execFileSync } from 'child_process'
import { existsSync, readdirSync, readFileSync, type Dirent } from 'fs'
import { request as httpRequest } from 'http'
import { app } from 'electron'
import { isAbsolute, join, resolve } from 'path'
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
  DevServerStatus
} from '@tools/devServer/index.d'

const MAX_LOGS = 50
const GRACEFUL_SHUTDOWN_TIMEOUT = 5000
const FORCE_KILL_TIMEOUT = 2000
const DEFAULT_WORKSPACE_NAME = 'tmp'
const PORT_PROBE_START = 5174
const PORT_PROBE_COUNT = 32
const PORT_PROBE_TIMEOUT = 800
const PORT_PROBE_INTERVAL = 500
const PORT_PROBE_MAX_ATTEMPTS = 60

const PORT_PATTERNS = [
  /Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,
  /https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,
  /server running (?:on|at) https?:\/\/.*?:(\d+)/i
]

const ERROR_PATTERNS = [
  /EADDRINUSE/i,
  /address already in use/i,
  /Error:/i,
  /ERROR/,
  /FATAL/i,
  /failed/i
]

type StartupMode = 'preview-script' | 'node-dev'

interface StartupStrategy {
  mode: StartupMode
  cwd: string
  command: string
  args: string[]
  detached: boolean
  description: string
}

interface InternalDevServerProcess {
  chatUuid: string
  process: ChildProcess
  status: DevServerStatus
  port: number | null
  logs: string[]
  error: string | null
  startTime: number
  stdoutBuffer: string
  stderrBuffer: string
  candidatePorts: Set<number>
  stopping: boolean
  shutdownTimer: NodeJS.Timeout | null
  readinessProbe: Promise<void> | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

class DevServerProcessManager {
  private processes = new Map<string, InternalDevServerProcess>()

  private normalizeWorkspacePath(workspacePath: string, chatUuid?: string): string {
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

    console.warn(`[DevServer] Relative workspace path detected, rebasing to userData: ${workspacePath}`)
    return resolve(join(userDataPath, clean))
  }

  private getWorkspacePath(chatUuid: string, customWorkspacePath?: string): string {
    if (customWorkspacePath) {
      return this.normalizeWorkspacePath(customWorkspacePath, chatUuid)
    }

    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'workspaces', chatUuid)
  }

  private getPreviewScriptCandidates(chatUuid: string, customWorkspacePath?: string): string[] {
    const workspacePath = this.getWorkspacePath(chatUuid, customWorkspacePath)
    const candidates = process.platform === 'win32'
      ? ['preview.cmd', 'preview.bat', 'preview.sh']
      : ['preview.sh']

    return candidates
      .map((fileName) => join(workspacePath, fileName))
      .filter((filePath) => existsSync(filePath))
  }

  checkPreviewSh(chatUuid: string, customWorkspacePath?: string): boolean {
    return this.getPreviewScriptCandidates(chatUuid, customWorkspacePath).length > 0
  }

  private findNodeProjectDir(workspacePath: string, maxDepth: number = 3): string | null {
    const rootPackage = join(workspacePath, 'package.json')
    if (existsSync(rootPackage)) {
      return workspacePath
    }

    let bestPath: string | null = null
    let bestDepth = Number.POSITIVE_INFINITY
    const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out'])

    const walk = (dirPath: string, depth: number): void => {
      if (depth > maxDepth) return

      let entries: Dirent<string>[]
      try {
        entries = readdirSync(dirPath, { withFileTypes: true }) as Dirent<string>[]
      } catch {
        return
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const entryName = String(entry.name)
        if (ignoredDirs.has(entryName)) continue

        const childPath = join(dirPath, entryName)
        const packagePath = join(childPath, 'package.json')
        if (existsSync(packagePath) && depth < bestDepth) {
          bestPath = childPath
          bestDepth = depth
        }

        walk(childPath, depth + 1)
      }
    }

    walk(workspacePath, 1)
    return bestPath
  }

  private hasDevScript(projectDir: string): boolean {
    try {
      const raw = readFileSync(join(projectDir, 'package.json'), 'utf-8')
      const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> }
      return typeof pkg?.scripts?.dev === 'string'
    } catch {
      return false
    }
  }

  private hasInstalledDependencies(projectDir: string): boolean {
    return existsSync(join(projectDir, 'node_modules'))
  }

  private resolveStartupStrategy(chatUuid: string, customWorkspacePath?: string): StartupStrategy | null {
    const workspacePath = this.getWorkspacePath(chatUuid, customWorkspacePath)
    const previewScripts = this.getPreviewScriptCandidates(chatUuid, customWorkspacePath)

    const previewScriptPath = process.platform === 'win32'
      ? previewScripts.find((filePath) => /\.(cmd|bat)$/i.test(filePath)) ?? null
      : previewScripts[0] ?? null

    if (previewScriptPath) {
      if (process.platform === 'win32') {
        return {
          mode: 'preview-script',
          cwd: workspacePath,
          command: 'cmd.exe',
          args: ['/d', '/s', '/c', `"${previewScriptPath}"`],
          detached: false,
          description: previewScriptPath
        }
      }

      return {
        mode: 'preview-script',
        cwd: workspacePath,
        command: 'bash',
        args: [previewScriptPath],
        detached: true,
        description: previewScriptPath
      }
    }

    const nodeProjectDir = this.findNodeProjectDir(workspacePath)
    if (!nodeProjectDir || !this.hasDevScript(nodeProjectDir)) {
      return null
    }

    const commandLine = this.hasInstalledDependencies(nodeProjectDir)
      ? 'npm run dev'
      : 'npm install && npm run dev'

    if (process.platform === 'win32') {
      return {
        mode: 'node-dev',
        cwd: nodeProjectDir,
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', commandLine],
        detached: false,
        description: commandLine
      }
    }

    return {
      mode: 'node-dev',
      cwd: nodeProjectDir,
      command: 'bash',
      args: ['-lc', commandLine],
      detached: true,
      description: commandLine
    }
  }

  private extractPortCandidates(output: string): number[] {
    const candidates: number[] = []
    const cleanOutput = stripAnsi(output)

    for (const pattern of PORT_PATTERNS) {
      const match = cleanOutput.match(pattern)
      if (!match?.[1]) continue

      const port = parseInt(match[1], 10)
      if (port > 0 && port < 65536) {
        candidates.push(port)
      }
    }

    return Array.from(new Set(candidates))
  }

  private containsError(output: string): boolean {
    return ERROR_PATTERNS.some((pattern) => pattern.test(output))
  }

  private pushLog(proc: InternalDevServerProcess, line: string): void {
    proc.logs.push(line)
    while (proc.logs.length > MAX_LOGS) {
      proc.logs.shift()
    }
  }

  private processOutputChunk(
    proc: InternalDevServerProcess,
    source: 'stdout' | 'stderr',
    chunk: string
  ): void {
    const property = source === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer'
    proc[property] += chunk

    const lines = proc[property].split(/\r?\n/)
    proc[property] = lines.pop() ?? ''

    for (const rawLine of lines) {
      this.handleOutputLine(proc, source, rawLine)
    }
  }

  private flushOutputBuffer(proc: InternalDevServerProcess, source: 'stdout' | 'stderr'): void {
    const property = source === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer'
    const line = proc[property].trim()
    if (line) {
      this.handleOutputLine(proc, source, line)
    }
    proc[property] = ''
  }

  private handleOutputLine(
    proc: InternalDevServerProcess,
    source: 'stdout' | 'stderr',
    rawLine: string
  ): void {
    const cleanLine = stripAnsi(rawLine).replace(/\r/g, '').trim()
    if (!cleanLine) {
      return
    }

    const logLine = source === 'stderr' ? `[stderr] ${cleanLine}` : cleanLine
    this.pushLog(proc, logLine)

    if (source === 'stderr') {
      console.error(`[DevServer:${proc.chatUuid}] ${cleanLine}`)
    } else {
      console.log(`[DevServer:${proc.chatUuid}] ${cleanLine}`)
    }

    for (const port of this.extractPortCandidates(cleanLine)) {
      proc.candidatePorts.add(port)
      if (proc.port !== port) {
        proc.port = port
      }
    }

    if (!proc.stopping && this.containsError(cleanLine)) {
      proc.status = 'error'
      proc.error = cleanLine
    }
  }

  private async probeHttpPort(port: number): Promise<string | null> {
    const hosts = ['127.0.0.1', 'localhost']

    for (const host of hosts) {
      const reachable = await new Promise<boolean>((resolve) => {
        const req = httpRequest(
          {
            host,
            port,
            path: '/',
            method: 'GET',
            timeout: PORT_PROBE_TIMEOUT
          },
          (res) => {
            res.resume()
            resolve(true)
          }
        )

        req.on('timeout', () => {
          req.destroy()
          resolve(false)
        })

        req.on('error', () => {
          resolve(false)
        })

        req.end()
      })

      if (reachable) {
        return host
      }
    }

    return null
  }

  private buildProbeCandidates(proc: InternalDevServerProcess): number[] {
    const candidates: number[] = []

    if (proc.port) {
      candidates.push(proc.port)
    }

    for (const port of proc.candidatePorts) {
      candidates.push(port)
    }

    for (let port = PORT_PROBE_START; port < PORT_PROBE_START + PORT_PROBE_COUNT; port++) {
      candidates.push(port)
    }

    return Array.from(new Set(candidates))
  }

  private async monitorServerReadiness(proc: InternalDevServerProcess): Promise<void> {
    for (let attempt = 0; attempt < PORT_PROBE_MAX_ATTEMPTS; attempt++) {
      if (this.processes.get(proc.chatUuid) !== proc) return
      if (proc.stopping || proc.status === 'error' || proc.status === 'running') return

      for (const port of this.buildProbeCandidates(proc)) {
        const reachableHost = await this.probeHttpPort(port)
        if (reachableHost) {
          proc.port = port
          proc.status = 'running'
          proc.error = null
          this.pushLog(proc, `[system] Dev server reachable at http://${reachableHost}:${port}`)
          console.log(`[DevServer:${proc.chatUuid}] ✅ HTTP probe succeeded at http://${reachableHost}:${port}`)
          return
        }
      }

      await sleep(PORT_PROBE_INTERVAL)
    }
  }

  private clearShutdownTimer(proc: InternalDevServerProcess): void {
    if (proc.shutdownTimer) {
      clearTimeout(proc.shutdownTimer)
      proc.shutdownTimer = null
    }
  }

  private async waitForProcessExit(childProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      return true
    }

    return new Promise((resolve) => {
      let settled = false
      const settle = (value: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        childProcess.removeListener('exit', onExit)
        childProcess.removeListener('close', onClose)
        resolve(value)
      }

      const onExit = () => settle(true)
      const onClose = () => settle(true)
      const timer = setTimeout(() => settle(false), timeoutMs)

      childProcess.once('exit', onExit)
      childProcess.once('close', onClose)
    })
  }

  private cleanupProcessRecord(chatUuid: string, proc: InternalDevServerProcess): void {
    this.clearShutdownTimer(proc)
    this.flushOutputBuffer(proc, 'stdout')
    this.flushOutputBuffer(proc, 'stderr')

    if (this.processes.get(chatUuid) === proc) {
      this.processes.delete(chatUuid)
    }
  }

  private killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    try {
      console.log(`[DevServer] Killing process tree for PID ${pid} with signal ${signal}`)

      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'])
        return
      }

      try {
        process.kill(-pid, signal)
      } catch {
        process.kill(pid, signal)
      }
    } catch (error) {
      console.error(`[DevServer] Error killing process tree:`, error)
    }
  }

  private async stopProcess(chatUuid: string, proc: InternalDevServerProcess): Promise<void> {
    if (proc.stopping) {
      return
    }

    proc.stopping = true
    proc.port = null
    proc.error = null
    this.clearShutdownTimer(proc)

    const pid = proc.process.pid
    if (!pid) {
      this.cleanupProcessRecord(chatUuid, proc)
      return
    }

    this.killProcessTree(pid, 'SIGTERM')
    proc.shutdownTimer = setTimeout(() => {
      if (proc.process.exitCode === null && proc.process.signalCode === null) {
        console.log(`[DevServer:${chatUuid}] Forcing kill after timeout`)
        this.killProcessTree(pid, 'SIGKILL')
      }
    }, GRACEFUL_SHUTDOWN_TIMEOUT)

    const exitedGracefully = await this.waitForProcessExit(proc.process, GRACEFUL_SHUTDOWN_TIMEOUT)
    if (!exitedGracefully) {
      this.killProcessTree(pid, 'SIGKILL')
      await this.waitForProcessExit(proc.process, FORCE_KILL_TIMEOUT)
    }

    this.cleanupProcessRecord(chatUuid, proc)
  }

  async startDevServer(chatUuid: string, customWorkspacePath?: string): Promise<StartDevServerResponse> {
    try {
      const existing = this.processes.get(chatUuid)
      if (existing && !existing.stopping && existing.status !== 'error') {
        return {
          success: false,
          error: 'Development server is already running or starting'
        }
      }

      if (existing) {
        await this.stopProcess(chatUuid, existing)
      }

      const workspacePath = this.getWorkspacePath(chatUuid, customWorkspacePath)
      const strategy = this.resolveStartupStrategy(chatUuid, customWorkspacePath)

      if (!strategy) {
        return {
          success: false,
          error: 'preview script not found in workspace and no Node project with "scripts.dev" was detected'
        }
      }

      console.log(`[DevServer] Starting server for workspace: ${chatUuid}`)
      console.log(`[DevServer] Startup mode: ${strategy.mode}`)
      console.log(`[DevServer] Command: ${strategy.description}`)
      console.log(`[DevServer] Working directory: ${strategy.cwd || workspacePath}`)

      const childProcess = spawn(strategy.command, strategy.args, {
        cwd: strategy.cwd,
        env: {
          ...process.env,
          BROWSER: 'none',
          FORCE_COLOR: '0',
          NODE_ENV: 'development'
        },
        detached: strategy.detached
      })

      const proc: InternalDevServerProcess = {
        chatUuid,
        process: childProcess,
        status: 'starting',
        port: null,
        logs: [],
        error: null,
        startTime: Date.now(),
        stdoutBuffer: '',
        stderrBuffer: '',
        candidatePorts: new Set<number>(),
        stopping: false,
        shutdownTimer: null,
        readinessProbe: null
      }

      this.processes.set(chatUuid, proc)

      childProcess.stdout?.on('data', (data: Buffer) => {
        this.processOutputChunk(proc, 'stdout', data.toString())
      })

      childProcess.stderr?.on('data', (data: Buffer) => {
        this.processOutputChunk(proc, 'stderr', data.toString())
      })

      childProcess.on('exit', (code, signal) => {
        this.flushOutputBuffer(proc, 'stdout')
        this.flushOutputBuffer(proc, 'stderr')
        this.clearShutdownTimer(proc)

        console.log(`[DevServer:${chatUuid}] Process exited with code ${code}, signal ${signal}`)

        if (proc.stopping) {
          this.cleanupProcessRecord(chatUuid, proc)
          return
        }

        proc.status = 'error'
        proc.error = `Process exited unexpectedly with code ${code ?? 'null'}`
        this.pushLog(proc, `Process exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`)
      })

      childProcess.on('error', (err) => {
        proc.status = 'error'
        proc.error = err.message
        this.pushLog(proc, `[system] Process error: ${err.message}`)
      })

      proc.readinessProbe = this.monitorServerReadiness(proc).catch((error) => {
        if (!proc.stopping && proc.status !== 'error') {
          proc.status = 'error'
          proc.error = error instanceof Error ? error.message : String(error)
          this.pushLog(proc, `[system] Readiness probe failed: ${proc.error}`)
        }
      })

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

  async stopDevServer(chatUuid: string): Promise<StopDevServerResponse> {
    try {
      const proc = this.processes.get(chatUuid)
      if (!proc) {
        return {
          success: true,
          message: 'Development server already idle'
        }
      }

      await this.stopProcess(chatUuid, proc)

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
      status: proc.stopping ? 'idle' : proc.status,
      port: proc.stopping ? null : proc.port,
      logs: [...proc.logs],
      error: proc.stopping ? null : proc.error
    }
  }

  getLogs(chatUuid: string, limit: number = MAX_LOGS): GetDevServerLogsResponse {
    const proc = this.processes.get(chatUuid)
    if (!proc) {
      return {
        success: true,
        logs: []
      }
    }

    return {
      success: true,
      logs: proc.logs.slice(-limit)
    }
  }

  stopAll(): void {
    console.log('[DevServer] Stopping all development servers...')
    for (const [chatUuid, proc] of this.processes.entries()) {
      void this.stopProcess(chatUuid, proc).catch((error) => {
        console.error(`[DevServer] Error stopping server for ${chatUuid}:`, error)
      })
    }
  }
}

const devServerManager = new DevServerProcessManager()

export async function processCheckPreviewSh(
  args: CheckPreviewShArgs
): Promise<CheckPreviewShResponse> {
  try {
    const { chatUuid, customWorkspacePath } = args
    const exists = devServerManager.checkPreviewSh(chatUuid, customWorkspacePath)

    return {
      success: true,
      exists
    }
  } catch (error: any) {
    console.error('[DevServer] processCheckPreviewSh error:', error)
    return {
      success: false,
      exists: false,
      error: error.message || 'Failed to check preview script'
    }
  }
}

export async function processStartDevServer(
  args: StartDevServerArgs
): Promise<StartDevServerResponse> {
  return devServerManager.startDevServer(args.chatUuid, args.customWorkspacePath)
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
  return devServerManager.getLogs(args.chatUuid, args.limit)
}

export function cleanupDevServers(): void {
  devServerManager.stopAll()
}
