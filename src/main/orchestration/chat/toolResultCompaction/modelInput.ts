export const MODEL_INPUT_LIMITS = {
  balanced: 12_000,
  minimal: 6_000
} as const

type StructuredSource = Record<string, unknown>

export interface BoundedStructuredModelInput {
  content: string
  originalCharacters: number
  sentCharacters: number
  truncated: boolean
}

const compactWithHeadAndTail = (
  content: string,
  bodyCharacters: number,
  marker: string
): string => {
  const characters = Array.from(content)
  if (characters.length <= bodyCharacters) {
    return content
  }

  const markerCharacters = Array.from(marker)
  const available = Math.max(0, bodyCharacters - markerCharacters.length)
  const headLength = Math.ceil(available * 0.7)
  const tailLength = Math.floor(available * 0.3)
  return [
    ...characters.slice(0, headLength),
    ...markerCharacters,
    ...characters.slice(characters.length - tailLength)
  ].slice(0, bodyCharacters).join('')
}

export function boundStructuredModelInput(
  metadata: StructuredSource,
  body: string,
  maxCharacters: number,
  marker: string
): BoundedStructuredModelInput {
  const serialize = (boundedBody: string): string => JSON.stringify({
    metadata,
    body: boundedBody
  })
  const original = serialize(body)
  if (Array.from(original).length <= maxCharacters) {
    return {
      content: original,
      originalCharacters: Array.from(original).length,
      sentCharacters: Array.from(original).length,
      truncated: false
    }
  }

  let low = 0
  let high = Math.min(Array.from(body).length, maxCharacters)
  let best = serialize('')
  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2)
    const candidate = serialize(compactWithHeadAndTail(body, midpoint, marker))
    if (Array.from(candidate).length <= maxCharacters) {
      best = candidate
      low = midpoint + 1
    } else {
      high = midpoint - 1
    }
  }

  return {
    content: best,
    originalCharacters: Array.from(original).length,
    sentCharacters: Array.from(best).length,
    truncated: true
  }
}

export function boundMetadataValue(value: string | undefined, maxCharacters: number): string {
  if (!value) return 'unknown'
  const characters = Array.from(value)
  if (characters.length <= maxCharacters) return value
  return `${characters.slice(0, Math.max(0, maxCharacters - 1)).join('')}…`
}
