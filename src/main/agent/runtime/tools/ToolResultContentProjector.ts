import type { ToolResultContentRepresentation } from '@main/agent/contracts'
import {
  COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS,
  compactToolContentForModelRequest
} from '@shared/tools/toolResultContent'
import type { ToolFailure } from '@shared/tools/toolFailure'
import { isNormalizedToolResultContent } from './result-normalization'

export type ToolResultContentReplayMode = 'hot' | 'cold'

export interface ToolResultProjectionError {
  message?: string
}

export interface FormatToolResultForModelInput {
  content: unknown
  error?: ToolResultProjectionError
  failure?: ToolFailure
  replayMode?: ToolResultContentReplayMode
  contentRepresentation?: ToolResultContentRepresentation
}

export interface ProjectToolResultContentForDisplayInput {
  content: unknown
  error?: ToolResultProjectionError
  failure?: ToolFailure
}

const formatToolFailure = (failure: ToolFailure): string => [
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
  replayMode,
  contentRepresentation
}: FormatToolResultForModelInput): string => {
  const failurePrefix = failure ? `${formatToolFailure(failure)}\n` : ''

  if (contentRepresentation === 'semantic_compaction') {
    return `${failurePrefix}${projectToolResultContentForDisplay({ content, error })}`
  }

  if (isNormalizedToolResultContent(content)) {
    return `${failurePrefix}${content.modelContent}`
  }

  if (replayMode === 'hot') {
    return `${failurePrefix}${projectToolResultContentForDisplay({ content, error })}`
  }

  if (typeof content === 'string') {
    return `${failurePrefix}${compactToolContentForModelRequest(content, {
      maxCharacters: COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
    })}`
  }

  if (content == null) {
    return failurePrefix || error?.message || ''
  }

  try {
    return `${failurePrefix}${compactToolContentForModelRequest(JSON.stringify(content), {
      maxCharacters: COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
    })}`
  } catch {
    return `${failurePrefix}${compactToolContentForModelRequest(String(content), {
      maxCharacters: COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
    })}`
  }
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
      .filter((part): part is VLMContent & { text: string } => (
        part?.type === 'text' && typeof part.text === 'string'
      ))
      .map(part => part.text)
      .join('')
  }
}
