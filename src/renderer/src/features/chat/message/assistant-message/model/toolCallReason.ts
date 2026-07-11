import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

const getStringRecordValue = (value: unknown, key: string): string | undefined => {
  return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === 'string'
    ? ((value as Record<string, unknown>)[key] as string)
    : undefined
}

const extractJsonStringProperty = (source: string, key: string): string | undefined => {
  const keyPattern = JSON.stringify(key)
  const keyIndex = source.indexOf(keyPattern)
  if (keyIndex < 0) return undefined

  let cursor = keyIndex + keyPattern.length
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }
  if (source[cursor] !== ':') return undefined

  cursor += 1
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }
  if (source[cursor] !== '"') return undefined

  cursor += 1
  let escaped = false
  let rawValue = ''

  for (; cursor < source.length; cursor += 1) {
    const char = source[cursor]
    if (escaped) {
      rawValue += `\\${char}`
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      try {
        return JSON.parse(`"${rawValue}"`) as string
      } catch {
        return undefined
      }
    }
    rawValue += char
  }

  return undefined
}

const extractToolReason = (args: unknown): string | undefined => {
  if (!args) return undefined
  const recordReason = getStringRecordValue(args, TOOL_CALL_REASON_PARAMETER_NAME)
  if (recordReason !== undefined) return recordReason
  if (typeof args !== 'string') return undefined

  return extractJsonStringProperty(args, TOOL_CALL_REASON_PARAMETER_NAME)
}

const getToolCallContent = (segment: ToolCallSegment): Record<string, unknown> => (
  segment.content && typeof segment.content === 'object'
    ? segment.content as Record<string, unknown>
    : {}
)

export const getReasonFromToolCall = (segment: ToolCallSegment): string | undefined => {
  const reason = extractToolReason(getToolCallContent(segment).args)
  return typeof reason === 'string' && reason.trim().length > 0
    ? reason.trim()
    : undefined
}
