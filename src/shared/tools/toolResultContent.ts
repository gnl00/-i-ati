export interface ToolContentRequestGuardOptions {
  maxCharacters?: number
}

export const DEFAULT_TOOL_CONTENT_REQUEST_MAX_CHARACTERS = 32_000
export const COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS = 1_000

const TOOL_CONTENT_REQUEST_HEAD_RATIO = 0.7
const TOOL_CONTENT_OMISSION_MARKER = '[tool result content omitted]'

const DATA_IMAGE_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\r\n]+/

export const containsInlineImageData = (content: string): boolean => (
  DATA_IMAGE_PATTERN.test(content)
)

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

  if (hasInlineImageData) {
    return [
      '[Tool result truncated for model request]',
      `originalChars=${content.length}`,
      'shownChars=0',
      `reason=${triggers.join(',')}`,
      'Inline image data was omitted from the model request.',
      'Inspect the persisted tool result or local artifact for the original payload.'
    ].join('\n')
  }

  const shownHeadCharacters = Math.floor(maxCharacters * TOOL_CONTENT_REQUEST_HEAD_RATIO)
  const shownTailCharacters = maxCharacters - shownHeadCharacters
  const shownHead = content.slice(0, shownHeadCharacters)
  const shownTail = shownTailCharacters > 0
    ? content.slice(-shownTailCharacters)
    : ''

  return [
    '[Tool result truncated for model request]',
    `originalChars=${content.length}`,
    `shownChars=${shownHead.length + shownTail.length}`,
    `shownHeadChars=${shownHead.length}`,
    `shownTailChars=${shownTail.length}`,
    `reason=${triggers.join(',')}`,
    `Showing the first ${shownHead.length} and final ${shownTail.length} characters of the tool result.`,
    'Inspect the persisted tool result or local artifact for the original payload.',
    '',
    shownHead,
    '',
    TOOL_CONTENT_OMISSION_MARKER,
    '',
    shownTail
  ].join('\n')
}
