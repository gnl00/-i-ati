import type { ToolResultContentRepresentation } from '@main/agent/contracts'
import {
  COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS,
  compactToolContentForModelRequest
} from '@shared/tools/toolResultContent'
import { isNormalizedToolResultContent } from './result-normalization'

export type ToolResultContentReplayMode = 'hot' | 'cold'

export interface ToolResultProjectionError {
  message?: string
}

export interface FormatToolResultForModelInput {
  content: unknown
  error?: ToolResultProjectionError
  replayMode?: ToolResultContentReplayMode
  contentRepresentation?: ToolResultContentRepresentation
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
  replayMode,
  contentRepresentation
}: FormatToolResultForModelInput): string => {
  if (contentRepresentation === 'semantic_compaction') {
    return projectToolResultContentForDisplay({ content, error })
  }

  if (isNormalizedToolResultContent(content)) {
    return content.modelContent
  }

  if (replayMode === 'hot') {
    return projectToolResultContentForDisplay({ content, error })
  }

  if (typeof content === 'string') {
    return compactToolContentForModelRequest(content, {
      maxCharacters: COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
    })
  }

  if (content == null) {
    return error?.message || ''
  }

  try {
    return compactToolContentForModelRequest(JSON.stringify(content), {
      maxCharacters: COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
    })
  } catch {
    return compactToolContentForModelRequest(String(content), {
      maxCharacters: COLD_TOOL_CONTENT_REQUEST_MAX_CHARACTERS
    })
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
