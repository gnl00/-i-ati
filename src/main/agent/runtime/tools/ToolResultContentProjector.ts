import { compactToolContentForModelRequest } from '@shared/tools/toolResultContent'
import { isNormalizedToolResultContent } from './result-normalization'

export type ToolResultContentReplayMode = 'hot' | 'cold'

export interface ToolResultProjectionError {
  message?: string
}

export interface FormatToolResultForModelInput {
  content: unknown
  error?: ToolResultProjectionError
  replayMode?: ToolResultContentReplayMode
}

export interface ProjectToolResultContentForDisplayInput {
  content: unknown
  error?: ToolResultProjectionError
}

export const projectToolResultContentForDisplay = ({
  content,
  error
}: ProjectToolResultContentForDisplayInput): string => {
  if (typeof content === 'string') {
    return content
  }

  if (content == null) {
    return error?.message || ''
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
  replayMode
}: FormatToolResultForModelInput): string => {
  if (isNormalizedToolResultContent(content)) {
    return content.modelContent
  }

  if (replayMode === 'hot') {
    return projectToolResultContentForDisplay({ content, error })
  }

  if (typeof content === 'string') {
    return compactToolContentForModelRequest(content)
  }

  if (content == null) {
    return error?.message || ''
  }

  try {
    return compactToolContentForModelRequest(JSON.stringify(content))
  } catch {
    return compactToolContentForModelRequest(String(content))
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
