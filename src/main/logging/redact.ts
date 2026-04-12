import type { SerializedLogError } from '@shared/types/logging'

const REDACTED_KEYS = ['authorization', 'apiKey', 'api_key', 'token', 'cookie', 'set-cookie']
const MAX_STRING_LENGTH = 2048
const MAX_ARRAY_LENGTH = 20
const MAX_DEPTH = 4

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}…<truncated:${value.length - MAX_STRING_LENGTH}>`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shouldRedactKey(key: string): boolean {
  return REDACTED_KEYS.includes(key)
}

export function serializeError(error: unknown): SerializedLogError | undefined {
  if (!error) return undefined

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  if (typeof error === 'string') {
    return { message: truncateString(error) }
  }

  return {
    message: truncateString(String(error))
  }
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value == null) return value

  if (typeof value === 'string') {
    return truncateString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value instanceof Error) {
    return serializeError(value)
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[Array(${value.length})]`
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeLogValue(item, depth + 1))
  }

  if (isPlainObject(value)) {
    if (depth >= MAX_DEPTH) return '[Object]'

    const output: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = shouldRedactKey(key) ? '[REDACTED]' : sanitizeLogValue(nestedValue, depth + 1)
    }
    return output
  }

  return truncateString(String(value))
}

export function formatConsoleArgs(args: unknown[]): { message: string; context?: unknown } {
  if (args.length === 0) {
    return { message: '' }
  }

  const [first, ...rest] = args
  const firstMessage = typeof first === 'string' ? truncateString(first) : truncateString(String(first))
  if (rest.length === 0) {
    return { message: firstMessage }
  }

  return {
    message: firstMessage,
    context: sanitizeLogValue(rest.length === 1 ? rest[0] : rest)
  }
}
