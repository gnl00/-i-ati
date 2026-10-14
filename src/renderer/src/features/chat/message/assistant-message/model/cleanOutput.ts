import type { AssistantMessageTranscriptProjection } from './assistantMessageMapper'
import { isImageDisplayTool, parseImageShowResult } from '@shared/tools/image/types'
import { getReasonFromToolCall } from './toolCallReason'

/** The single boundary for future answer selection. Preserve all visible text for now. */
export function projectCleanOutputContent(transcript: AssistantMessageTranscriptProjection): Pick<AssistantMessageTranscriptProjection, 'textItems'> & {
  imageItems: AssistantMessageTranscriptProjection['supportItems']
  errorItems: AssistantMessageTranscriptProjection['supportItems']
  hasVisibleContent: boolean
} {
  const textItems = transcript.textItems.filter(item => item.segment.content.trim().length > 0)
  const imageItems = transcript.supportItems.filter(item => item.segment.type === 'toolCall' && isImageDisplayTool(item.segment.name))
  const errorItems = transcript.supportItems.filter(item => item.segment.type === 'error')
  return {
    textItems,
    imageItems,
    errorItems,
    hasVisibleContent: textItems.length > 0 || errorItems.length > 0
      || imageItems.some(item => item.segment.type === 'toolCall' && Boolean(parseImageShowResult(item.segment.content?.result)))
  }
}

const reasoningSentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })

function getReasoningPreview(segment: ReasoningSegment): string | undefined {
  const sentences = Array.from(reasoningSentences.segment(segment.content.trim().replace(/\s+/g, ' ')), item => item.segment.trim())
    .filter(Boolean)
  const candidate = sentences[1] ?? (segment.endedAt != null ? sentences[0] : undefined)
  if (!candidate) return undefined
  // A trailing streaming fragment is not ready until its sentence terminator arrives.
  if (segment.endedAt == null && !/[.!?。！？]["'”’」』）)\]]*$/u.test(candidate)) return undefined
  return candidate.replace(/\s+/g, ' ')
}

export function projectCleanOutputStatus(
  transcript: AssistantMessageTranscriptProjection,
  interaction?: 'approval' | 'question' | 'cancelling'
): string {
  if (interaction === 'cancelling') return 'Stopping…'
  if (interaction === 'approval') return 'Waiting for approval'
  if (interaction === 'question') return 'Waiting for your answer'
  const activeTools = transcript.supportItems.filter(item => item.segment.type === 'toolCall'
    && !item.segment.isError
    && (!item.segment.content?.status || ['pending', 'running'].includes(item.segment.content.status)))
  const reason = [...activeTools].reverse()
    .map(item => item.segment.type === 'toolCall' ? getReasonFromToolCall(item.segment) : undefined)
    .find(value => Boolean(value))
    ?.replace(/\s+/g, ' ')
  if (reason) return activeTools.length > 1 ? `Running ${activeTools.length} tools ${reason}` : reason
  if (activeTools.length > 1) return `Running ${activeTools.length} tools…`
  const tool = activeTools[0]?.segment
  if (tool?.type === 'toolCall') {
    const name = tool.name.replace(/[^a-zA-Z0-9_. -]/g, '').slice(0, 64) || 'tool'
    return `${tool.content?.status === 'running' ? 'Running' : 'Preparing'} ${name}…`
  }
  const tail = [...transcript.textItems, ...transcript.supportItems]
    .reduce<(typeof transcript.textItems)[number] | (typeof transcript.supportItems)[number] | undefined>(
      (latest, item) => !latest || item.order > latest.order ? item : latest, undefined
    )
  if (tail?.segment.type === 'text') return 'Writing response…'
  if (tail?.segment.type === 'reasoning') {
    return getReasoningPreview(tail.segment) ?? (tail.segment.endedAt == null ? 'Thinking…' : 'Working…')
  }
  return 'Working…'
}
