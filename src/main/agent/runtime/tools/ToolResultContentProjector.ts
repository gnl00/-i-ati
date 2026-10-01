import type { ToolFailure } from '@shared/tools/toolFailure'

export interface ToolResultProjectionError {
  message?: string
}

export interface FormatToolResultForModelInput {
  content?: unknown
  error?: ToolResultProjectionError
  failure?: ToolFailure
  modelContent?: string
  status?: string
}

export interface ProjectToolResultContentForDisplayInput {
  content?: unknown
  error?: ToolResultProjectionError
  failure?: ToolFailure
}

const formatToolFailure = (failure: ToolFailure): string =>
  [
    '[tool_failure]',
    `category=${failure.category}`,
    `code=${failure.code}`,
    `message=${failure.message}`,
    `recovery_action=${failure.recovery.action}`,
    `recovery=${failure.recovery.message}`,
    ...(failure.sourceCode !== undefined ? [`source_code=${failure.sourceCode}`] : []),
    ...(failure.termination ? [`termination=${failure.termination}`] : [])
  ].join('\n')

export const projectToolResultContentForDisplay = ({
  content,
  error,
  failure
}: ProjectToolResultContentForDisplayInput): string => {
  if (typeof content === 'string') {
    return content
  }

  if (content == null) {
    return failure ? formatToolFailure(failure) : error?.message || ''
  }

  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

export const formatToolResultForModel = ({
  content,
  error,
  failure,
  modelContent,
  status
}: FormatToolResultForModelInput): string => {
  if (modelContent !== undefined) return modelContent
  const failurePrefix = failure
    ? `${formatToolFailure(failure)}\n`
    : status && status !== 'success'
      ? `[Tool status: ${status}]\n`
      : ''
  const text = projectToolResultContentForDisplay({ content, error })
  return `${failurePrefix}${text || error?.message || '[Tool completed with no output]'}`
}

export const projectToolResultContentForHistoryImport = (
  content: string | VLMContent[]
): string => {
  if (typeof content === 'string') {
    return content
  }

  try {
    return JSON.stringify(content)
  } catch {
    return content
      .filter(
        (part): part is VLMContent & { text: string } =>
          part?.type === 'text' && typeof part.text === 'string'
      )
      .map((part) => part.text)
      .join('')
  }
}
