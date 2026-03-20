import type { LogLevel } from '@shared/types/logging'
import { logService, shouldLog } from './LogService'
import { formatConsoleArgs } from './redact'

type ConsoleMethod = (...args: unknown[]) => void

const originalConsole: Record<LogLevel, ConsoleMethod> = {
  debug: console.debug.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

let installed = false

export function installMainConsoleCapture(): void {
  if (installed) return
  installed = true

  console.debug = createConsoleInterceptor('debug')
  console.log = createConsoleInterceptor('info')
  console.warn = createConsoleInterceptor('warn')
  console.error = createConsoleInterceptor('error')
}

function createConsoleInterceptor(level: LogLevel): ConsoleMethod {
  return (...args: unknown[]) => {
    originalConsole[level](...args)
    if (!shouldLog(level)) return

    const { message, context } = formatConsoleArgs(args)
    logService.write({
      level,
      scope: 'Console',
      process: 'main',
      message,
      context
    })
  }
}
