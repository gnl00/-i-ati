import { LOG_WRITE } from '@shared/constants'
import type { LogLevel, LogTarget, LogWritePayload } from '@shared/types/logging'

type ConsoleMethod = (...args: unknown[]) => void

const originalConsole: Record<LogLevel, ConsoleMethod> = {
  debug: console.debug.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

let installed = false

function canUseIPC(): boolean {
  return Boolean((window as any).electron?.ipcRenderer)
}

function sendRendererLog(level: LogLevel, args: unknown[], target: LogTarget = 'app'): void {
  if (!canUseIPC()) return

  const [first, ...rest] = args
  const payload: LogWritePayload = {
    level,
    target,
    scope: 'Console',
    process: 'renderer',
    message: typeof first === 'string' ? first : String(first ?? ''),
    context: rest.length === 0 ? undefined : rest.length === 1 ? rest[0] : rest,
    timestamp: Date.now()
  }

  window.electron.ipcRenderer.send(LOG_WRITE, payload)
}

export function installRendererConsoleCapture(): void {
  if (installed) return
  installed = true

  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args)
    sendRendererLog('debug', args)
  }
  console.log = (...args: unknown[]) => {
    originalConsole.info(...args)
    sendRendererLog('info', args)
  }
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args)
    sendRendererLog('warn', args)
  }
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args)
    sendRendererLog('error', args)
  }
}

export function createRendererLogger(scope: string) {
  return createScopedRendererLogger(scope, 'app')
}

export function createRendererPerfLogger(scope: string) {
  return createScopedRendererLogger(scope, 'perf')
}

function createScopedRendererLogger(scope: string, target: LogTarget) {
  return {
    debug: (message: string, context?: unknown) => writeScopedRendererLog('debug', scope, message, context, undefined, target),
    info: (message: string, context?: unknown) => writeScopedRendererLog('info', scope, message, context, undefined, target),
    warn: (message: string, context?: unknown) => writeScopedRendererLog('warn', scope, message, context, undefined, target),
    error: (message: string, errorOrContext?: unknown) =>
      writeScopedRendererLog(
        'error',
        scope,
        message,
        errorOrContext instanceof Error ? undefined : errorOrContext,
        errorOrContext instanceof Error ? errorOrContext : undefined,
        target
      )
  }
}

function writeScopedRendererLog(
  level: LogLevel,
  scope: string,
  message: string,
  context?: unknown,
  error?: Error,
  target: LogTarget = 'app'
): void {
  originalConsole[level](message, context ?? '')
  if (!canUseIPC()) return

  const payload: LogWritePayload = {
    level,
    target,
    scope,
    process: 'renderer',
    message,
    context,
    error: error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      : undefined,
    timestamp: Date.now()
  }

  window.electron.ipcRenderer.send(LOG_WRITE, payload)
}
