export interface ToolContentRequestGuardOptions {
  maxCharacters?: number
}

export const DEFAULT_TOOL_CONTENT_REQUEST_MAX_CHARACTERS = 32_000

const TOOL_CONTENT_REQUEST_HEAD_RATIO = 0.7
const TOOL_CONTENT_OMISSION_MARKER = '[tool result content omitted]'

const DATA_IMAGE_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\r\n]+/

export const containsInlineImageData = (content: string): boolean =>
  DATA_IMAGE_PATTERN.test(content)

export const compactToolContentForModelRequest = (
  content: string,
  options: ToolContentRequestGuardOptions = {}
): string => {
  const maxCharacters = options.maxCharacters ?? DEFAULT_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
  const hasInlineImageData = containsInlineImageData(content)
  const isLargeContent = content.length > maxCharacters
  const triggers: string[] = []

  if (isLargeContent) {
    triggers.push(`large_content>${maxCharacters}`)
  }

  if (hasInlineImageData) {
    triggers.push('inline_image')
  }

  if (triggers.length === 0) {
    return content
  }

  const safeContent = hasInlineImageData
    ? content.replace(new RegExp(DATA_IMAGE_PATTERN.source, 'g'), '[Inline image data omitted]')
    : content
  const header = [
    '[Tool result preview]',
    `originalChars=${content.length}`,
    `reason=${triggers.join(',')}`
  ].join('\n')
  const marker = `\n\n${TOOL_CONTENT_OMISSION_MARKER}\n\n`
  const available = Math.max(0, maxCharacters - header.length - 2)
  if (safeContent.length <= available) return `${header}\n\n${safeContent}`.slice(0, maxCharacters)
  const sourceBudget = Math.max(0, available - marker.length)
  const headSize = Math.floor(sourceBudget * TOOL_CONTENT_REQUEST_HEAD_RATIO)
  const tailSize = sourceBudget - headSize
  return `${header}\n\n${safeContent.slice(0, headSize)}${marker}${tailSize ? safeContent.slice(-tailSize) : ''}`.slice(
    0,
    maxCharacters
  )
}
