import { app } from 'electron'
import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino'
import type { LogLevel, LogTarget, LogWritePayload } from '@shared/types/logging'
import { redactSensitiveText } from '@shared/security/SensitiveTextRedactor'
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

type ClosableDestination = DestinationStream & {
  end?: () => void
  once?: (event: string, listener: (...args: unknown[]) => void) => void
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
  private schedulerDateKey: string | null = null
  private schedulerDestination: DestinationStream | null = null
  private schedulerLogger: PinoLogger | null = null
  private additionalRedactionSecrets: readonly string[] = []
  private pendingWrites: Array<{
    level: LogLevel
    scope: string
    process: 'main' | 'renderer'
    message: string
    context?: unknown
    error?: unknown
    target?: LogTarget
  }> = []

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initializePromise) return await this.initializePromise

    this.initializePromise = (async (): Promise<void> => {
      await this.rotateIfNeeded()
      await this.ensurePerfLogger()
      await this.ensureSchedulerLogger()
      await this.fileManager.compressAndCleanup(this.currentDateKey ?? this.fileManager.getDateKey())
      this.initialized = true
    })()

    try {
      await this.initializePromise
    } finally {
      this.initializePromise = null
    }
  }

  setAdditionalRedactionSecrets(secrets: readonly string[]): void {
    this.additionalRedactionSecrets = [...secrets].filter(secret => secret.length > 0)
  }

  async close(): Promise<void> {
    this.flushPendingWrites()

    const loggers = [this.fileLogger, this.perfLogger, this.schedulerLogger]
    await Promise.all(loggers.map(logger => this.flushLogger(logger)))

    const destinations = [this.destination, this.perfDestination, this.schedulerDestination]
    await Promise.all(destinations.map(destination => this.closeDestination(destination)))

    this.destination = null
    this.fileLogger = null
    this.perfDestination = null
    this.perfLogger = null
    this.schedulerDestination = null
    this.schedulerLogger = null
    this.currentDateKey = null
    this.perfDateKey = null
    this.schedulerDateKey = null
    this.initialized = false
  }

  createLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
    return this.createScopedLogger(scope, process, 'app')
  }

  createPerfLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
    return this.createScopedLogger(scope, process, 'perf')
  }

  createSchedulerLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
    return this.createScopedLogger(scope, process, 'scheduler')
  }

  private createScopedLogger(
    scope: string,
    process: 'main' | 'renderer',
    target: LogTarget
  ): ScopedLogger {
    return {
      debug: (message, context) => this.write({ level: 'debug', scope, process, message, context, target }),
      info: (message, context) => this.write({ level: 'info', scope, process, message, context, target }),
      warn: (message, context) => this.write({ level: 'warn', scope, process, message, context, target }),
      error: (message, errorOrContext): void => {
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
      error: payload.error,
      target: payload.target
    })
  }

  write(input: {
    level: LogLevel
    scope: string
    process: 'main' | 'renderer'
    message: string
    context?: unknown
    error?: unknown
    target?: LogTarget
  }): void {
    void this.ensureReadyForWrite()

    const logger = this.getLogger(input.target)
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

    logger[input.level](this.redactAdditionalSecrets(payload))
  }

  private redactAdditionalSecrets(value: unknown): unknown {
    if (this.additionalRedactionSecrets.length === 0) return value

    if (typeof value === 'string') {
      let redacted = redactSensitiveText(value).content
      for (const secret of this.additionalRedactionSecrets) {
        redacted = redacted.split(secret).join('[REDACTED]')
      }
      return redacted
    }

    if (Array.isArray(value)) {
      return value.map(item => this.redactAdditionalSecrets(item))
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, this.redactAdditionalSecrets(nestedValue)])
      )
    }

    return value
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
    const shouldCleanup = this.currentDateKey !== nowDateKey
      || this.perfDateKey !== nowDateKey
      || this.schedulerDateKey !== nowDateKey
    if (this.currentDateKey !== nowDateKey) {
      await this.rotateIfNeeded()
    }

    if (this.perfDateKey !== nowDateKey || !this.perfLogger) {
      await this.ensurePerfLogger()
    }

    if (this.schedulerDateKey !== nowDateKey || !this.schedulerLogger) {
      await this.ensureSchedulerLogger()
    }

    if (shouldCleanup) {
      await this.fileManager.compressAndCleanup(nowDateKey)
    }

    this.flushPendingWrites()
  }

  private async flushLogger(logger: PinoLogger | null): Promise<void> {
    if (!logger || typeof logger.flush !== 'function') return

    await new Promise<void>((resolve, reject) => {
      try {
        logger.flush((error?: Error) => {
          if (error) reject(error)
          else resolve()
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  private async closeDestination(destination: DestinationStream | null): Promise<void> {
    const stream = destination as ClosableDestination | null
    const end = stream?.end
    if (!end) return

    const once = stream.once
    if (!once) {
      end.call(stream)
      return
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        resolve()
      }
      const fail = (error: unknown): void => {
        if (settled) return
        settled = true
        reject(error)
      }

      once.call(stream, 'finish', finish)
      once.call(stream, 'close', finish)
      once.call(stream, 'error', fail)
      try {
        end.call(stream)
      } catch (error) {
        fail(error)
      }
    })
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

  private async ensureSchedulerLogger(): Promise<void> {
    const nextDateKey = this.fileManager.getDateKey()
    if (this.schedulerDateKey === nextDateKey && this.schedulerLogger) return

    const schedulerLogPath = this.fileManager.getSchedulerLogFilePath(nextDateKey)
    const previousDestination = this.schedulerDestination as (DestinationStream & { flushSync?: () => void; end?: () => void }) | null
    previousDestination?.flushSync?.()
    previousDestination?.end?.()
    this.schedulerDestination = pino.destination({ dest: schedulerLogPath, mkdir: true, sync: false })
    this.schedulerLogger = pino(
      {
        level: 'debug',
        base: undefined,
        timestamp: localIsoPinoTimestamp,
        formatters: {
          level: (label) => ({ level: label })
        }
      },
      this.schedulerDestination
    )
    this.schedulerDateKey = nextDateKey
  }

  private getLogger(target: LogTarget | undefined): PinoLogger | null {
    if (target === 'perf') return this.perfLogger
    if (target === 'scheduler') return this.schedulerLogger
    return this.fileLogger
  }

  private flushPendingWrites(): void {
    if (this.pendingWrites.length === 0) return

    const queuedWrites = this.pendingWrites
    this.pendingWrites = []

    for (const entry of queuedWrites) {
      const logger = this.getLogger(entry.target)
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

export function createSchedulerLogger(scope: string, process: 'main' | 'renderer' = 'main'): ScopedLogger {
  return logService.createSchedulerLogger(scope, process)
}

export function shouldLog(level: LogLevel): boolean {
  const minimumLevel = (process.env.NODE_ENV === 'development' ? 'debug' : 'info') as LogLevel
  return levelPriority[level] >= levelPriority[minimumLevel]
}
