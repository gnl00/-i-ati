import type { TextSegmentRenderItem } from './assistantMessageMapper'

export interface AssistantMessageTextPlaybackInput {
  role: ChatMessage['role']
  source?: ChatMessage['source']
  typewriterCompleted?: ChatMessage['typewriterCompleted']
  segments: TextSegment[]
}

export interface AssistantMessageTextPlaybackModel {
  committed: AssistantMessageTextPlaybackInput
  preview: AssistantMessageTextPlaybackInput
}

export interface AssistantMessageTextPlaybackSource {
  committedMessage: ChatMessage
  previewMessage?: ChatMessage
}

export const EMPTY_PREVIEW_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: '',
  segments: [],
  source: 'stream_preview',
  typewriterCompleted: true
}

export function buildAssistantMessageTextPlaybackInput(
  message: ChatMessage | undefined,
  segments: TextSegment[]
): AssistantMessageTextPlaybackInput {
  return {
    role: message?.role ?? 'assistant',
    source: message?.source,
    typewriterCompleted: message?.typewriterCompleted,
    segments
  }
}

export function buildAssistantMessageTextPlaybackModel(
  source: AssistantMessageTextPlaybackSource,
  items: TextSegmentRenderItem[]
): AssistantMessageTextPlaybackModel {
  const committedSegments = items
    .filter((item) => item.layer === 'committed')
    .map((item) => item.segment)
  const previewSegments = items
    .filter((item) => item.layer === 'preview')
    .map((item) => item.segment)

  return {
    committed: buildAssistantMessageTextPlaybackInput(source.committedMessage, committedSegments),
    preview: buildAssistantMessageTextPlaybackInput(source.previewMessage ?? EMPTY_PREVIEW_MESSAGE, previewSegments)
  }
}
