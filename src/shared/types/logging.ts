export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogTarget = 'app' | 'perf'

export interface SerializedLogError {
  name?: string
  message: string
  stack?: string
}

export interface LogWritePayload {
  level: LogLevel
  scope: string
  message: string
  process: 'main' | 'renderer'
  target?: LogTarget
  context?: unknown
  error?: SerializedLogError
  timestamp?: number
}
