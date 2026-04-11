export const decodeEscapedString = (value: string) =>
  value
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

export const normalizeToolArgs = (args: any): any => {
  if (Array.isArray(args)) return args.map(normalizeToolArgs)
  if (args && typeof args === 'object') {
    const normalized: Record<string, any> = {}
    for (const [key, val] of Object.entries(args)) {
      normalized[key] =
        typeof val === 'string' ? decodeEscapedString(val) : normalizeToolArgs(val)
    }
    return normalized
  }
  return args
}
