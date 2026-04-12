import { app } from 'electron'
import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino'
import type { LogLevel, LogWritePayload } from '@shared/types/logging'
import { LogFileManager } from './LogFileManager'
import { sanitizeLogValue, serializeError } from './redact'
import { localIsoPinoTimestamp } from './time'

const levelPriority: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
}

export interface ScopedLogger {
  debug: (message: string, context?: unknown) => void
  info: (message: string, context?: unknown) => void
  warn: (message: string, context?: unknown) => void
  error: (message: string, errorOrContext?: unknown) => void
}

export class LogService {
  private readonly fileManager = new LogFileManager()
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private currentDateKey: string | null = null
  private destination: DestinationStream | null = null
  private fileLogger: PinoLogger | null = null
  private perfDateKey: string | null = null
  private perfDestination: DestinationStream | null = null
  private perfLogger: PinoLogger | null = null
  private pendingWrites: Array<{
    level: LogLevel
    scope: string
    process: 'main' | 'renderer'
    message: string
    context?: unknown
    error?: unknown
    target?: 'app' | 'perf'
  }> = []

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initializePromise) return await this.initializePromise

    this.initializePromise = (async () => {
      await this.rotateIfNeeded()
      await this.ensurePerfLogger()
      await this.fileManager.compressAndCleanup(this.currentDateKey ?? this.fileManager.getDateKey())
      this.initialized = true
    })()

    try {
      await this.initializePromise
    } finally {
      this.initializePromise = null
    }
  }

  createLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
    return this.createScopedLogger(scope, process, 'app')
  }

  createPerfLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
    return this.createScopedLogger(scope, process, 'perf')
  }

  private createScopedLogger(
    scope: string,
    process: 'main' | 'renderer',
    target: 'app' | 'perf'
  ): ScopedLogger {
    return {
      debug: (message, context) => this.write({ level: 'debug', scope, process, message, context, target }),
      info: (message, context) => this.write({ level: 'info', scope, process, message, context, target }),
      warn: (message, context) => this.write({ level: 'warn', scope, process, message, context, target }),
      error: (message, errorOrContext) => {
        const error = errorOrContext instanceof Error ? errorOrContext : undefined
        const context = error ? undefined : errorOrContext
        this.write({ level: 'error', scope, process, message, context, error, target })
      }
    }
  }

  writeFromRenderer(payload: LogWritePayload): void {
    this.write({
      level: payload.level,
      scope: payload.scope,
      process: 'renderer',
      message: payload.message,
      context: payload.context,
      error: payload.error
    })
  }

  write(input: {
    level: LogLevel
    scope: string
    process: 'main' | 'renderer'
    message: string
    context?: unknown
    error?: unknown
    target?: 'app' | 'perf'
  }): void {
    void this.ensureReadyForWrite()

    const logger = input.target === 'perf' ? this.perfLogger : this.fileLogger
    if (!logger) {
      this.pendingWrites.push(input)
      return
    }

    this.writeToLogger(logger, input)
  }

  private writeToLogger(
    logger: PinoLogger,
    input: {
      level: LogLevel
      scope: string
      process: 'main' | 'renderer'
      message: string
      context?: unknown
      error?: unknown
    }
  ): void {
    const serializedError = serializeError(input.error)
    const payload: Record<string, unknown> = {
      scope: input.scope,
      process: input.process,
      msg: input.message
    }

    if (input.context !== undefined) {
      payload.context = sanitizeLogValue(input.context)
    }

    if (serializedError) {
      payload.err = serializedError
    }

    logger[input.level](payload)
  }

  private async ensureReadyForWrite(): Promise<void> {
    if (!app.isReady()) {
      return
    }

    if (!this.initialized) {
      await this.initialize()
      return
    }

    const nowDateKey = this.fileManager.getDateKey()
    if (this.currentDateKey !== nowDateKey) {
      await this.rotateIfNeeded()
      await this.fileManager.compressAndCleanup(nowDateKey)
    }

    if (this.perfDateKey !== nowDateKey || !this.perfLogger) {
      await this.ensurePerfLogger()
    }

    this.flushPendingWrites()
  }

  private async rotateIfNeeded(): Promise<void> {
    const nextDateKey = this.fileManager.getDateKey()
    if (this.currentDateKey === nextDateKey && this.fileLogger) return

    const logPath = this.fileManager.getLogFilePath(nextDateKey)
    const previousDestination = this.destination as (DestinationStream & { flushSync?: () => void; end?: () => void }) | null
    previousDestination?.flushSync?.()
    previousDestination?.end?.()
    this.destination = pino.destination({ dest: logPath, mkdir: true, sync: false })
    this.fileLogger = pino(
      {
        level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
        base: undefined,
        timestamp: localIsoPinoTimestamp,
        formatters: {
          level: (label) => ({ level: label })
        }
      },
      this.destination
    )
    this.currentDateKey = nextDateKey
  }

  private async ensurePerfLogger(): Promise<void> {
    const nextDateKey = this.fileManager.getDateKey()
    if (this.perfDateKey === nextDateKey && this.perfLogger) return

    const perfLogPath = this.fileManager.getPerfLogFilePath(nextDateKey)
    const previousDestination = this.perfDestination as (DestinationStream & { flushSync?: () => void; end?: () => void }) | null
    previousDestination?.flushSync?.()
    previousDestination?.end?.()
    this.perfDestination = pino.destination({ dest: perfLogPath, mkdir: true, sync: false })
    this.perfLogger = pino(
      {
        level: 'debug',
        base: undefined,
        timestamp: localIsoPinoTimestamp,
        formatters: {
          level: (label) => ({ level: label })
        }
      },
      this.perfDestination
    )
    this.perfDateKey = nextDateKey
  }

  private flushPendingWrites(): void {
    if (this.pendingWrites.length === 0) return

    const queuedWrites = this.pendingWrites
    this.pendingWrites = []

    for (const entry of queuedWrites) {
      const logger = entry.target === 'perf' ? this.perfLogger : this.fileLogger
      if (!logger) {
        this.pendingWrites.push(entry)
        continue
      }
      this.writeToLogger(logger, entry)
    }
  }
}

export const logService = new LogService()

export function createLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
  return logService.createLogger(scope, process)
}

export function createPerfLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
  return logService.createPerfLogger(scope, process)
}

export function shouldLog(level: LogLevel): boolean {
  const minimumLevel = (process.env.NODE_ENV === 'development' ? 'debug' : 'info') as LogLevel
  return levelPriority[level] >= levelPriority[minimumLevel]
}
