export interface ToolContentRequestGuardOptions {
  maxCharacters?: number
}

export const DEFAULT_TOOL_CONTENT_REQUEST_MAX_CHARACTERS = 32_000

const DATA_IMAGE_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\r\n]+/

export const containsInlineImageData = (content: string): boolean => (
  DATA_IMAGE_PATTERN.test(content)
)

export const compactToolContentForModelRequest = (
  content: string,
  options: ToolContentRequestGuardOptions = {}
): string => {
  const maxCharacters = options.maxCharacters ?? DEFAULT_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
  const triggers: string[] = []

  if (content.length > maxCharacters) {
    triggers.push(`large_content>${maxCharacters}`)
  }

  if (containsInlineImageData(content)) {
    triggers.push('inline_image')
  }

  if (triggers.length === 0) {
    return content
  }

  return [
    '[Tool result compacted for model request]',
    `originalChars=${content.length}`,
    `reason=${triggers.join(',')}`,
    'Inspect the persisted tool result or local artifact for the original payload.'
  ].join('\n')
}
