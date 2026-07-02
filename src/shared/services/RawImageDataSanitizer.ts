const DATA_IMAGE_URL_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=_\-\r\n]+/g
const LONG_BASE64_PATTERN = /\b[A-Za-z0-9+/=_-]{160,}\b/g
const IMAGE_OMITTED_TEXT = '[Image omitted from compression input]'
const IMAGE_DATA_OMITTED_TEXT = '[Image data omitted]'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
)

export const sanitizeRawImageDataUrls = (text: string): string => (
  text
    .replace(DATA_IMAGE_URL_PATTERN, IMAGE_DATA_OMITTED_TEXT)
    .replace(LONG_BASE64_PATTERN, IMAGE_DATA_OMITTED_TEXT)
)

export const sanitizeRawImageData = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return sanitizeRawImageDataUrls(value)
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeRawImageData)
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeRawImageData(entry)])
    )
  }

  return value
}

export const sanitizeCompressionContent = (content: ChatMessage['content']): ChatMessage['content'] | unknown => {
  if (typeof content === 'string') {
    return sanitizeRawImageDataUrls(content)
  }

  if (!Array.isArray(content)) {
    return sanitizeRawImageData(content)
  }

  let imageOrdinal = 0
  return content.map((part) => {
    if (
      isRecord(part)
      && part.type === 'image_url'
      && isRecord(part.image_url)
      && typeof part.image_url.url === 'string'
      && part.image_url.url.trim()
    ) {
      imageOrdinal += 1
      return {
        type: 'text',
        text: `${IMAGE_OMITTED_TEXT} #${imageOrdinal}`
      }
    }

    return sanitizeRawImageData(part)
  })
}
