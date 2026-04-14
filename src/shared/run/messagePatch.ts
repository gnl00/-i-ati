import type { MessageSegmentPatch } from './output-events'

export function areToolCallsEquivalent(
  previous: IToolCall[] | undefined,
  next: IToolCall[] | undefined
): boolean {
  if (previous === next) return true
  if (!previous?.length && !next?.length) return true
  if (!previous || !next || previous.length !== next.length) return false

  return previous.every((toolCall, index) => {
    const nextToolCall = next[index]
    return toolCall.id === nextToolCall.id
      && toolCall.index === nextToolCall.index
      && toolCall.type === nextToolCall.type
      && toolCall.function?.name === nextToolCall.function?.name
      && toolCall.function?.arguments === nextToolCall.function?.arguments
  })
}

export function areSegmentsEquivalent(previous: MessageSegment, next: MessageSegment): boolean {
  if (previous.type !== next.type) return false
  if (previous.segmentId && next.segmentId && previous.segmentId !== next.segmentId) return false

  switch (next.type) {
    case 'text':
      return previous.type === 'text'
        && previous.content === next.content
        && previous.timestamp === next.timestamp
        && previous.segmentId === next.segmentId
    case 'reasoning':
      return previous.type === 'reasoning'
        && previous.content === next.content
        && previous.timestamp === next.timestamp
        && previous.segmentId === next.segmentId
        && previous.endedAt === next.endedAt
    case 'toolCall':
      return previous.type === 'toolCall'
        && previous.segmentId === next.segmentId
        && previous.name === next.name
        && previous.toolCallId === next.toolCallId
        && previous.toolCallIndex === next.toolCallIndex
        && previous.timestamp === next.timestamp
        && previous.cost === next.cost
        && previous.isError === next.isError
        && previous.content?.status === next.content?.status
        && previous.content?.args === next.content?.args
        && previous.content?.error === next.content?.error
        && previous.content?.result === next.content?.result
        && previous.content?.raw === next.content?.raw
    case 'error':
      return previous.type === 'error'
        && previous.segmentId === next.segmentId
        && previous.error.timestamp === next.error.timestamp
        && previous.error.name === next.error.name
        && previous.error.message === next.error.message
        && previous.error.code === next.error.code
        && previous.error.stack === next.error.stack
    default:
      return false
  }
}

export function getSegmentIdentity(segment: MessageSegment, index: number): string {
  if (segment.segmentId) return segment.segmentId
  if (segment.type === 'toolCall' && segment.toolCallId) return `tool:${segment.toolCallId}`
  if (segment.type === 'error') return `error:${segment.error.timestamp}:${index}`
  return `${segment.type}:${('timestamp' in segment && typeof segment.timestamp === 'number') ? segment.timestamp : index}`
}

export function mergeSegmentsByIdentity(
  previous: MessageSegment[] | undefined,
  next: MessageSegment[] | undefined
): MessageSegment[] {
  if (!next?.length) return next ?? []
  if (!previous?.length) return next

  const previousById = new Map<string, MessageSegment>()
  previous.forEach((segment, index) => {
    previousById.set(getSegmentIdentity(segment, index), segment)
  })

  return next.map((segment, index) => {
    const previousSegment = previousById.get(getSegmentIdentity(segment, index))
    if (!previousSegment) {
      return segment
    }
    return areSegmentsEquivalent(previousSegment, segment) ? previousSegment : segment
  })
}

export function mergeMessageEntityPreservingSegments(
  previous: MessageEntity,
  next: MessageEntity
): MessageEntity {
  return {
    ...next,
    body: {
      ...next.body,
      segments: mergeSegmentsByIdentity(previous.body.segments, next.body.segments),
      toolCalls: areToolCallsEquivalent(previous.body.toolCalls, next.body.toolCalls)
        ? previous.body.toolCalls
        : next.body.toolCalls
    }
  }
}

export function patchSegmentsByIdentity(
  existing: MessageSegment[] | undefined,
  patch: MessageSegment
): MessageSegment[] {
  const current = existing ?? []
  const patchIdentity = getSegmentIdentity(patch, current.length)
  const index = current.findIndex((segment, segmentIndex) => (
    getSegmentIdentity(segment, segmentIndex) === patchIdentity
  ))

  if (index < 0) {
    return [...current, patch]
  }

  return current.map((segment, segmentIndex) => (
    segmentIndex === index
      ? (areSegmentsEquivalent(segment, patch) ? segment : patch)
      : segment
  ))
}

export function applyMessageSegmentPatchToBody(
  body: ChatMessage,
  patch: MessageSegmentPatch
): ChatMessage {
  const nextToolCalls = patch.toolCalls !== undefined
    ? (areToolCallsEquivalent(body.toolCalls, patch.toolCalls) ? body.toolCalls : patch.toolCalls)
    : body.toolCalls

  return {
    ...body,
    ...(patch.content !== undefined ? { content: patch.content } : {}),
    ...(patch.toolCalls !== undefined ? { toolCalls: nextToolCalls } : {}),
    ...(patch.typewriterCompleted !== undefined
      ? { typewriterCompleted: patch.typewriterCompleted }
      : {}),
    segments: patch.replaceSegments
      ? mergeSegmentsByIdentity(body.segments, patch.replaceSegments)
      : patchSegmentsByIdentity(body.segments, patch.segment)
  }
}

export function applyMessageSegmentPatchToEntity(
  message: MessageEntity,
  patch: MessageSegmentPatch
): MessageEntity {
  return {
    ...message,
    body: applyMessageSegmentPatchToBody(message.body, patch)
  }
}

export function buildDifferentialSegmentPatches(
  previousBody: ChatMessage,
  nextBody: ChatMessage
): MessageSegmentPatch[] {
  const previousSegments = previousBody.segments ?? []
  const nextSegments = nextBody.segments ?? []

  if (previousSegments.length !== nextSegments.length || (
    !previousSegments.every((segment, index) => (
      getSegmentIdentity(segment, index) === getSegmentIdentity(nextSegments[index], index)
    ))
  )) {
    return nextSegments.map((segment, index) => ({
      segment,
      ...(index === 0 ? { replaceSegments: nextSegments } : {}),
      ...(index === 0
        ? {
            content: nextBody.content,
            toolCalls: nextBody.toolCalls,
            typewriterCompleted: nextBody.typewriterCompleted
          }
        : {})
    }))
  }

  const changedIndices = nextSegments
    .map((segment, index) => (
      areSegmentsEquivalent(previousSegments[index], segment) ? -1 : index
    ))
    .filter((index) => index >= 0)

  if (changedIndices.length === 0) {
    if (
      previousBody.content === nextBody.content
      && areToolCallsEquivalent(previousBody.toolCalls, nextBody.toolCalls)
      && previousBody.typewriterCompleted === nextBody.typewriterCompleted
    ) {
      return []
    }

    const fallbackSegment = nextSegments[0]
    return fallbackSegment
      ? [{
          segment: fallbackSegment,
          content: nextBody.content,
          toolCalls: nextBody.toolCalls,
          typewriterCompleted: nextBody.typewriterCompleted
        }]
      : []
  }

  return changedIndices.map((index, patchIndex) => ({
    segment: nextSegments[index],
    ...(patchIndex === 0
      ? {
          content: nextBody.content,
          toolCalls: nextBody.toolCalls,
          typewriterCompleted: nextBody.typewriterCompleted
        }
      : {})
  }))
}
