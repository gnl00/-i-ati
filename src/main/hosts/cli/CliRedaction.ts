import { redactSensitiveText } from '@shared/security/SensitiveTextRedactor'

const REDACTED = '[REDACTED]'
const SENSITIVE_KEYS = new Set([
  'apikey',
  'authorization',
  'accesstoken',
  'bearertoken',
  'clientsecret',
  'cookie',
  'credential',
  'credentials',
  'password',
  'passwd',
  'privatekey',
  'refreshtoken',
  'secret',
  'sessionid',
  'sessiontoken'
])

const isSensitiveKey = (key: string): boolean => (
  SENSITIVE_KEYS.has(key.replace(/[_-]/g, '').toLowerCase())
)

const redactString = (value: string, secrets: readonly string[]): string => {
  let redacted = redactSensitiveText(value).content
  for (const secret of [...secrets]
    .filter((candidate) => candidate.length > 0)
    .sort((left, right) => right.length - left.length)) {
    redacted = redacted.split(secret).join(REDACTED)
  }
  return redacted
}

export const redactCliValue = (
  value: unknown,
  secrets: readonly string[] = [],
  seen = new WeakSet<object>()
): unknown => {
  if (value == null) return value

  if (typeof value === 'string') {
    return redactString(value, secrets)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message, secrets),
      ...(value.stack ? { stack: redactString(value.stack, secrets) } : {})
    }
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value)
  }

  if (seen.has(value as object)) {
    return '[Circular]'
  }
  seen.add(value as object)

  if (Array.isArray(value)) {
    const output = value.map((item) => redactCliValue(item, secrets, seen))
    seen.delete(value)
    return output
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = isSensitiveKey(key)
        ? REDACTED
        : redactCliValue(nestedValue, secrets, seen)
    }
    seen.delete(value)
    return output
  }

  seen.delete(value as object)
  return String(value)
}

export const redactCliText = (
  value: string,
  secrets: readonly string[] = []
): string => redactString(value, secrets)
