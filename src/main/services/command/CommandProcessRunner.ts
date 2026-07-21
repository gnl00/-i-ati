import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { StringDecoder } from 'string_decoder'
import type { EmbeddedToolOutputChunk } from '@shared/tools/registry'

export const COMMAND_OUTPUT_LIMIT_BYTES = 512 * 1024
export const COMMAND_TERMINATION_GRACE_MS = 2_000
export const COMMAND_TERMINATION_DEADLINE_MS = 7_000

export interface CommandProcessRunOptions {
  executable: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  signal?: AbortSignal
  onOutput?: (chunk: EmbeddedToolOutputChunk) => void
  windowsVerbatimArguments?: boolean
}

export interface CommandProcessRunResult {
  stdout: string
  stderr: string
  stdoutBytes: number
  stderrBytes: number
  stdoutTruncated: boolean
  stderrTruncated: boolean
  exitCode: number | null
  terminationSignal: NodeJS.Signals | null
  executionTimeMs: number
  timedOut: boolean
  aborted: boolean
}

export class CommandProcessSpawnError extends Error {
  readonly code?: string | number
  readonly result: CommandProcessRunResult

  constructor(error: unknown, result: CommandProcessRunResult) {
    const candidate = error as { message?: string; code?: string | number }
    super(candidate?.message ?? String(error))
    this.name = 'CommandProcessSpawnError'
    this.code = candidate?.code
    this.result = result
  }
}

class BoundedHeadTailBuffer {
  private readonly headLimit: number
  private readonly tailLimit: number
  private head = Buffer.alloc(0)
  private tail = Buffer.alloc(0)
  private totalBytes = 0

  constructor(private readonly limitBytes: number) {
    this.headLimit = Math.ceil(limitBytes / 2)
    this.tailLimit = Math.floor(limitBytes / 2)
  }

  append(chunk: Buffer): void {
    if (chunk.length === 0) return

    this.totalBytes += chunk.length
    let remainder = chunk
    const headRemaining = this.headLimit - this.head.length
    if (headRemaining > 0) {
      const headChunk = remainder.subarray(0, headRemaining)
      this.head = Buffer.concat([this.head, headChunk], this.head.length + headChunk.length)
      remainder = remainder.subarray(headChunk.length)
    }

    if (remainder.length > 0 && this.tailLimit > 0) {
      const boundedRemainder = remainder.length > this.tailLimit
        ? remainder.subarray(remainder.length - this.tailLimit)
        : remainder
      const combined = Buffer.concat([this.tail, boundedRemainder])
      this.tail = combined.subarray(Math.max(0, combined.length - this.tailLimit))
    }
  }

  get bytes(): number {
    return this.totalBytes
  }

  get truncated(): boolean {
    return this.totalBytes > this.limitBytes
  }

  toString(): string {
    const decoder = new StringDecoder('utf8')
    if (!this.truncated) {
      return decoder.write(Buffer.concat([this.head, this.tail])) + decoder.end()
    }

    const headDecoder = new StringDecoder('utf8')
    const tailDecoder = new StringDecoder('utf8')
    const head = headDecoder.write(this.head)
    let tailStart = 0
    while (
      tailStart < this.tail.length
      && (this.tail[tailStart] & 0b1100_0000) === 0b1000_0000
    ) {
      tailStart += 1
    }
    const tail = tailDecoder.write(this.tail.subarray(tailStart)) + tailDecoder.end()
    return `${head}\n\n[command output truncated; ${this.totalBytes} original bytes]\n\n${tail}`
  }
}

function emptyResult(startedAt: number): CommandProcessRunResult {
  return {
    stdout: '',
    stderr: '',
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    exitCode: null,
    terminationSignal: null,
    executionTimeMs: Date.now() - startedAt,
    timedOut: false,
    aborted: false
  }
}

function killChildProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    child.kill(signal)
  } catch {
    // The child may have exited while the termination request was being prepared.
  }
}

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (!pid) return

  try {
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot || process.env.WINDIR
      const taskkillExecutable = systemRoot
        ? join(systemRoot, 'System32', 'taskkill.exe')
        : 'taskkill.exe'
      const taskkill = spawn(
        taskkillExecutable,
        ['/pid', String(pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true }
      )
      const fallbackKill = (): void => killChildProcess(child, 'SIGKILL')
      taskkill.once('error', fallbackKill)
      taskkill.once('close', (exitCode) => {
        if (exitCode !== 0) fallbackKill()
      })
      taskkill.unref()
      return
    }

    try {
      process.kill(-pid, signal)
    } catch {
      process.kill(pid, signal)
    }
  } catch {
    // The process may have exited between the close check and the signal.
  }
}

function forceKillProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    // A delayed escalation stays scoped to the original process group.
  }
}

export function runCommandProcess(
  options: CommandProcessRunOptions
): Promise<CommandProcessRunResult> {
  const startedAt = Date.now()
  if (options.signal?.aborted) {
    return Promise.resolve({
      ...emptyResult(startedAt),
      aborted: true
    })
  }

  return new Promise((resolve, reject) => {
    const stdoutBuffer = new BoundedHeadTailBuffer(COMMAND_OUTPUT_LIMIT_BYTES)
    const stderrBuffer = new BoundedHeadTailBuffer(COMMAND_OUTPUT_LIMIT_BYTES)
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let timedOut = false
    let aborted = false
    let resultSettled = false
    let processGroupCleanupPending = false
    let timeoutTimer: NodeJS.Timeout | undefined
    let forceKillTimer: NodeJS.Timeout | undefined
    let terminationDeadlineTimer: NodeJS.Timeout | undefined
    let child: ChildProcess

    const buildResult = (
      exitCode: number | null,
      terminationSignal: NodeJS.Signals | null
    ): CommandProcessRunResult => ({
      stdout: stdoutBuffer.toString(),
      stderr: stderrBuffer.toString(),
      stdoutBytes: stdoutBuffer.bytes,
      stderrBytes: stderrBuffer.bytes,
      stdoutTruncated: stdoutBuffer.truncated,
      stderrTruncated: stderrBuffer.truncated,
      exitCode,
      terminationSignal,
      executionTimeMs: Date.now() - startedAt,
      timedOut,
      aborted
    })

    const emitOutput = (chunk: EmbeddedToolOutputChunk): void => {
      if (!chunk.text) return
      try {
        options.onOutput?.(chunk)
      } catch {
        // Output observers must not change the child-process lifecycle.
      }
    }

    const cleanupResultLifecycle = (): void => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (forceKillTimer && !processGroupCleanupPending) clearTimeout(forceKillTimer)
      if (terminationDeadlineTimer) clearTimeout(terminationDeadlineTimer)
      options.signal?.removeEventListener('abort', onAbort)
    }

    const requestTermination = (reason: 'timeout' | 'abort'): void => {
      if (resultSettled || timedOut || aborted) return
      timedOut = reason === 'timeout'
      aborted = reason === 'abort'
      terminateProcessTree(child, 'SIGTERM')

      if (process.platform === 'win32') {
        forceKillTimer = setTimeout(() => {
          if (!resultSettled) terminateProcessTree(child, 'SIGKILL')
        }, COMMAND_TERMINATION_GRACE_MS)
        forceKillTimer.unref?.()
      } else if (child.pid) {
        const processGroupId = child.pid
        processGroupCleanupPending = true
        forceKillTimer = setTimeout(() => {
          processGroupCleanupPending = false
          forceKillProcessGroup(processGroupId)
        }, COMMAND_TERMINATION_GRACE_MS)
      }

      terminationDeadlineTimer = setTimeout(() => {
        if (resultSettled) return
        resultSettled = true
        killChildProcess(child, 'SIGKILL')
        child.stdout?.destroy()
        child.stderr?.destroy()
        child.unref()
        emitOutput({ stream: 'stdout', text: stdoutDecoder.end() })
        emitOutput({ stream: 'stderr', text: stderrDecoder.end() })
        cleanupResultLifecycle()
        resolve(buildResult(null, 'SIGKILL'))
      }, COMMAND_TERMINATION_DEADLINE_MS)
      terminationDeadlineTimer.unref?.()
    }

    const onAbort = (): void => requestTermination('abort')

    try {
      child = spawn(options.executable, options.args, {
        cwd: options.cwd,
        env: options.env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        windowsVerbatimArguments: options.windowsVerbatimArguments
      })
    } catch (error) {
      reject(new CommandProcessSpawnError(error, emptyResult(startedAt)))
      return
    }

    child.stdout?.on('data', (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      stdoutBuffer.append(chunk)
      emitOutput({ stream: 'stdout', text: stdoutDecoder.write(chunk) })
    })
    child.stderr?.on('data', (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      stderrBuffer.append(chunk)
      emitOutput({ stream: 'stderr', text: stderrDecoder.write(chunk) })
    })

    child.once('error', (error) => {
      if (resultSettled) return
      resultSettled = true
      emitOutput({ stream: 'stdout', text: stdoutDecoder.end() })
      emitOutput({ stream: 'stderr', text: stderrDecoder.end() })
      cleanupResultLifecycle()
      reject(new CommandProcessSpawnError(error, buildResult(null, null)))
    })

    child.once('close', (exitCode, terminationSignal) => {
      if (resultSettled) return
      resultSettled = true
      emitOutput({ stream: 'stdout', text: stdoutDecoder.end() })
      emitOutput({ stream: 'stderr', text: stderrDecoder.end() })
      cleanupResultLifecycle()
      resolve(buildResult(exitCode, terminationSignal))
    })

    if (options.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => requestTermination('timeout'), options.timeoutMs)
      timeoutTimer.unref?.()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) {
      onAbort()
    }
  })
}
