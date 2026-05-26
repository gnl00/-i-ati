import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type {
  ComputerUseActionResult,
  ComputerUseAppDescriptor,
  ComputerUseBackend,
  ComputerUsePermissionDiagnostics,
  ComputerUseRuntimeDiagnostics,
  ComputerUseState,
  ComputerUseStateInput,
  ComputerUseWindowDescriptor
} from './ComputerUseBackend'

interface JsonRpcSuccess<T = unknown> {
  jsonrpc?: '2.0'
  id: string
  result: T
}

interface JsonRpcFailure {
  jsonrpc?: '2.0'
  id: string
  error: {
    code?: string | number
    message: string
    data?: unknown
  }
}

type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcFailure

export class KwwkBridgeError extends Error {
  constructor(
    message: string,
    readonly code?: string | number,
    readonly data?: unknown
  ) {
    super(message)
    this.name = 'KwwkBridgeError'
  }
}

export interface KwwkBridgeTransport {
  start(): Promise<void>
  send(line: string): void
  stop(): Promise<void>
  onLine(listener: (line: string) => void): () => void
  onExit(listener: (error?: Error) => void): () => void
}

export interface StdioKwwkBridgeTransportOptions {
  command: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export class StdioKwwkBridgeTransport implements KwwkBridgeTransport {
  private process?: ChildProcessWithoutNullStreams
  private readonly events = new EventEmitter()

  constructor(private readonly options: StdioKwwkBridgeTransportOptions) {}

  async start(): Promise<void> {
    if (this.process) {
      return
    }

    this.process = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: 'pipe'
    })

    const stdout = createInterface({ input: this.process.stdout })
    stdout.on('line', line => this.events.emit('line', line))
    this.process.stderr.on('data', chunk => this.events.emit('stderr', chunk.toString()))
    this.process.on('error', error => this.events.emit('exit', error))
    this.process.on('exit', (code, signal) => {
      this.process = undefined
      this.events.emit(
        'exit',
        new Error(`kwwk bridge exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      )
    })
  }

  send(line: string): void {
    if (!this.process) {
      throw new KwwkBridgeError('kwwk bridge process is not running', 'BRIDGE_NOT_RUNNING')
    }
    this.process.stdin.write(`${line}\n`)
  }

  async stop(): Promise<void> {
    const current = this.process
    if (!current) {
      return
    }
    this.process = undefined
    current.kill()
  }

  onLine(listener: (line: string) => void): () => void {
    this.events.on('line', listener)
    return () => this.events.off('line', listener)
  }

  onExit(listener: (error?: Error) => void): () => void {
    this.events.on('exit', listener)
    return () => this.events.off('exit', listener)
  }
}

export interface KwwkComputerUseBridgeClientOptions {
  transport?: KwwkBridgeTransport
  command?: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  requestTimeoutMs?: number
  idFactory?: () => string
}

interface PendingRequest {
  timeout: NodeJS.Timeout
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export class KwwkComputerUseBridgeClient implements ComputerUseBackend {
  private readonly command: string
  private readonly transport: KwwkBridgeTransport
  private readonly requestTimeoutMs: number
  private readonly idFactory: () => string
  private readonly pending = new Map<string, PendingRequest>()
  private started = false
  private sequence = 0

  constructor(options: KwwkComputerUseBridgeClientOptions = {}) {
    const command = options.command ?? resolveDefaultKwwkBridgeCommand()
    this.command = command
    this.transport = options.transport ?? new StdioKwwkBridgeTransport({
      command,
      args: options.args,
      cwd: options.cwd,
      env: options.env
    })
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.idFactory = options.idFactory ?? (() => `${Date.now()}-${this.sequence += 1}`)
    this.transport.onLine(line => this.handleLine(line))
    this.transport.onExit(error => this.rejectAll(error ?? new Error('kwwk bridge exited')))
  }

  async diagnostics(): Promise<ComputerUseRuntimeDiagnostics> {
    const bridgeDiagnostics = await this.request<ComputerUseRuntimeDiagnostics>('diagnostics', {})
    return {
      ...bridgeDiagnostics,
      helperPath: bridgeDiagnostics.helperPath ?? this.command,
      transport: {
        command: this.command,
        resolvedFrom: resolveKwwkBridgeCommandSource(this.command)
      }
    }
  }

  async requestPermissions(): Promise<ComputerUsePermissionDiagnostics> {
    return this.request('requestPermissions', {})
  }

  async listApps(): Promise<ComputerUseAppDescriptor[]> {
    return this.request('apps', {})
  }

  async runningApps(): Promise<ComputerUseAppDescriptor[]> {
    return this.request('runningApps', {})
  }

  async openApp(input: { app: string }): Promise<ComputerUseActionResult> {
    return this.request('openApp', input)
  }

  async listWindows(input: { app: string }): Promise<ComputerUseWindowDescriptor[]> {
    return this.request('windows', input)
  }

  async state(input: ComputerUseStateInput): Promise<ComputerUseState> {
    return this.request('state', input)
  }

  async clickElement(input: {
    snapshotId: string
    elementIndex: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult> {
    return this.request('click', input)
  }

  async clickCoordinate(input: {
    snapshotId: string
    x: number
    y: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult> {
    return this.request('click', input)
  }

  async typeText(input: {
    snapshotId: string
    text: string
    elementIndex?: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult> {
    return this.request('typeText', input)
  }

  async setValue(input: {
    snapshotId: string
    elementIndex: number
    value: string
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult> {
    return this.request('setValue', input)
  }

  async pressKey(input: {
    snapshotId: string
    key: string
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult> {
    return this.request('pressKey', input)
  }

  async scroll(input: {
    snapshotId: string
    elementIndex: number
    direction: 'up' | 'down' | 'left' | 'right'
    pages?: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult> {
    return this.request('scroll', input)
  }

  async drag(input: {
    snapshotId: string
    fromX: number
    fromY: number
    toX: number
    toY: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult> {
    return this.request('drag', input)
  }

  async finish(): Promise<void> {
    if (this.started) {
      await this.request('finish', {})
    }
    await this.transport.stop()
    this.started = false
  }

  private async request<T>(method: string, params: unknown): Promise<T> {
    await this.ensureStarted()
    const id = this.idFactory()
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }

    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new KwwkBridgeError(`kwwk bridge request timed out: ${method}`, 'BRIDGE_REQUEST_TIMEOUT'))
      }, this.requestTimeoutMs)

      this.pending.set(id, {
        timeout,
        resolve: value => resolve(value as T),
        reject
      })

      try {
        this.transport.send(JSON.stringify(message))
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) {
      return
    }
    await this.transport.start()
    this.started = true
  }

  private handleLine(line: string): void {
    let response: JsonRpcResponse
    try {
      response = JSON.parse(line) as JsonRpcResponse
    } catch {
      return
    }

    if (!response || typeof response.id !== 'string') {
      return
    }

    const pending = this.pending.get(response.id)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeout)
    this.pending.delete(response.id)

    if ('error' in response) {
      pending.reject(new KwwkBridgeError(
        response.error.message,
        response.error.code,
        response.error.data
      ))
      return
    }

    pending.resolve(response.result)
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
      this.pending.delete(id)
    }
    this.started = false
  }
}

export const resolveDefaultKwwkBridgeCommand = (): string => {
  const resourceCandidate = path.join(process.resourcesPath || process.cwd(), 'native', 'kwwk-computer-use-bridge')
  if (existsSync(resourceCandidate)) {
    return resourceCandidate
  }

  const devCandidate = path.join(process.cwd(), 'resources', 'native', 'kwwk-computer-use-bridge')
  if (existsSync(devCandidate)) {
    return devCandidate
  }

  return 'kwwk-computer-use-bridge'
}

export const resolveKwwkBridgeCommandSource = (command: string): 'packaged' | 'dev-resource' | 'path' | 'path-lookup' => {
  const packaged = path.join(process.resourcesPath || process.cwd(), 'native', 'kwwk-computer-use-bridge')
  if (command === packaged) {
    return 'packaged'
  }

  const dev = path.join(process.cwd(), 'resources', 'native', 'kwwk-computer-use-bridge')
  if (command === dev) {
    return 'dev-resource'
  }

  return command.includes(path.sep) ? 'path' : 'path-lookup'
}
