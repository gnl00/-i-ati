import { createHash } from 'crypto'
import { appendFile } from 'fs/promises'
import { LogFileManager } from '@main/logging/LogFileManager'

const DEFAULT_MAX_BODY_CHARS = 512 * 1024
const REDACTED_KEYS = new Set(['authorization', 'apikey', 'api_key', 'token', 'cookie', 'set-cookie', 'x-api-key'])
const DATA_URL_PATTERN = /data:([a-zA-Z0-9.+/-]+);base64,([a-zA-Z0-9+/=\r\n]+)/g

export interface RequestDebugBodyLogSummary {
  requestLogId: string
  bodyBytes: number
  bodySha256: string
  bodyChars: number
  sanitizedBodyChars: number
  emittedChars: number
  omittedChars: number
  messageCount?: number
  toolCount?: number
  truncated: boolean
  mediaCount: number
  redactionCount: number
}

export interface RequestDebugBodyLog {
  summary: RequestDebugBodyLogSummary
  bodyText: string
}

interface BuildBodyLogOptions {
  requestLogId: string
  serializedBody: string
  maxBodyChars?: number
}

export interface WriteRequestBodyLogOptions {
  requestLogId: string
  time: string
  baseUrl: string
  adapterPluginId: string
  model: string
  endpoint: string
  stream: boolean
  body: unknown
  serializedBody: string
}

interface SanitizeStats {
  mediaCount: number
  redactionCount: number
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
)

const shouldRedactKey = (key: string): boolean => REDACTED_KEYS.has(key.toLowerCase())

const hashString = (value: string): string => createHash('sha256').update(value).digest('hex')

const toMediaPlaceholder = (mimeType: string, base64Value: string): string => {
  const cleanBase64 = base64Value.replace(/\s/g, '')
  const bytes = Buffer.byteLength(cleanBase64, 'base64')
  const digest = createHash('sha256').update(Buffer.from(cleanBase64, 'base64')).digest('hex').slice(0, 16)
  return `[media:${mimeType};base64 bytes=${bytes} sha256=${digest}]`
}

const compressDataUrls = (value: string, stats: SanitizeStats): string => (
  value.replace(DATA_URL_PATTERN, (_match, mimeType: string, base64Value: string) => {
    stats.mediaCount += 1
    return toMediaPlaceholder(mimeType, base64Value)
  })
)

const sanitizeDebugValue = (
  value: unknown,
  stats: SanitizeStats,
  seen: WeakSet<object>
): unknown => {
  if (value == null) return value

  if (typeof value === 'string') {
    return compressDataUrls(value, stats)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'function') {
    return '[Function]'
  }

  if (typeof value === 'symbol') {
    return value.toString()
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    }
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const output = value.map(item => sanitizeDebugValue(item, stats, seen))
    seen.delete(value)
    return output
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    if (isPlainObject(value)) {
      const output: Record<string, unknown> = {}
      for (const [key, nestedValue] of Object.entries(value)) {
        if (shouldRedactKey(key)) {
          stats.redactionCount += 1
          output[key] = '[REDACTED]'
          continue
        }
        output[key] = sanitizeDebugValue(nestedValue, stats, seen)
      }
      seen.delete(value)
      return output
    }

    seen.delete(value)
    return String(value)
  }

  return String(value)
}

const countArrayField = (body: unknown, key: string): number | undefined => {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return Array.isArray(value) ? value.length : undefined
}

const formatRequestBlock = (
  options: WriteRequestBodyLogOptions,
  debugLog: RequestDebugBodyLog
): string => {
  const summary = debugLog.summary
  return [
    `===== request ${options.time} requestLogId=${options.requestLogId} =====`,
    `baseUrl: ${options.baseUrl}`,
    `endpoint: ${options.endpoint}`,
    `adapterPluginId: ${options.adapterPluginId}`,
    `model: ${options.model}`,
    `stream: ${options.stream}`,
    `bodyBytes: ${summary.bodyBytes}`,
    `bodySha256: ${summary.bodySha256}`,
    `bodyChars: ${summary.bodyChars}`,
    `sanitizedBodyChars: ${summary.sanitizedBodyChars}`,
    `emittedChars: ${summary.emittedChars}`,
    `omittedChars: ${summary.omittedChars}`,
    `messageCount: ${summary.messageCount ?? 0}`,
    `toolCount: ${summary.toolCount ?? 0}`,
    `mediaCount: ${summary.mediaCount}`,
    `redactionCount: ${summary.redactionCount}`,
    `truncated: ${summary.truncated}`,
    '',
    debugLog.bodyText,
    `===== end request requestLogId=${options.requestLogId} =====`,
    ''
  ].join('\n')
}

export class RequestDebugLogger {
  constructor(private readonly logFileManager = new LogFileManager()) {}

  static buildBodyLog(
    body: unknown,
    options: BuildBodyLogOptions
  ): RequestDebugBodyLog {
    const maxBodyChars = options.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS
    const stats: SanitizeStats = {
      mediaCount: 0,
      redactionCount: 0
    }
    const sanitizedBody = sanitizeDebugValue(body, stats, new WeakSet<object>())
    const sanitizedBodyJson = JSON.stringify(sanitizedBody, null, 2) ?? String(sanitizedBody)
    const bodyText = sanitizedBodyJson.length > maxBodyChars
      ? sanitizedBodyJson.slice(0, maxBodyChars)
      : sanitizedBodyJson

    return {
      summary: {
        requestLogId: options.requestLogId,
        bodyBytes: Buffer.byteLength(options.serializedBody, 'utf8'),
        bodySha256: hashString(options.serializedBody),
        bodyChars: options.serializedBody.length,
        sanitizedBodyChars: sanitizedBodyJson.length,
        emittedChars: bodyText.length,
        omittedChars: sanitizedBodyJson.length - bodyText.length,
        messageCount: countArrayField(body, 'messages'),
        toolCount: countArrayField(body, 'tools'),
        truncated: sanitizedBodyJson.length > maxBodyChars,
        mediaCount: stats.mediaCount,
        redactionCount: stats.redactionCount
      },
      bodyText
    }
  }

  async writeRequestBody(options: WriteRequestBodyLogOptions): Promise<void> {
    const debugLog = RequestDebugLogger.buildBodyLog(options.body, {
      requestLogId: options.requestLogId,
      serializedBody: options.serializedBody
    })
    await this.logFileManager.ensureLogsDir()
    await appendFile(
      this.logFileManager.getRequestLogFilePath(),
      `${formatRequestBlock(options, debugLog)}\n`,
      'utf8'
    )
  }
}
