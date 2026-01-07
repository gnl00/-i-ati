import type { BaseError } from './errors'

/**
 * 日志级别
 */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3
}

/**
 * 日志记录器配置
 */
export interface LoggerConfig {
  level: LogLevel
  prefix?: string
  enableTimestamp?: boolean
}

/**
 * 统一日志记录器
 */
export class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.Info,
      prefix: '[ChatSubmit]',
      enableTimestamp: true,
      ...config
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level
  }

  private formatMessage(level: string, message: string): string {
    const parts: string[] = []

    if (this.config.enableTimestamp) {
      parts.push(new Date().toISOString())
    }

    if (this.config.prefix) {
      parts.push(this.config.prefix)
    }

    parts.push(`[${level}]`, message)

    return parts.join(' ')
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.Debug)) {
      console.debug(this.formatMessage('DEBUG', message), data || '')
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.Info)) {
      console.log(this.formatMessage('INFO', message), data || '')
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.Warn)) {
      console.warn(this.formatMessage('WARN', message), data || '')
    }
  }

  error(message: string, error?: Error | BaseError): void {
    if (this.shouldLog(LogLevel.Error)) {
      const formattedMessage = this.formatMessage('ERROR', message)

      if (error && 'toJSON' in error && typeof error.toJSON === 'function') {
        console.error(formattedMessage, error.toJSON())
      } else if (error) {
        console.error(formattedMessage, {
          name: error.name,
          message: error.message,
          stack: error.stack
        })
      } else {
        console.error(formattedMessage)
      }
    }
  }
}

// 创建默认日志记录器实例
export const logger = new Logger()
