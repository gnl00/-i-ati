export const buildMessageSegmentId = (
  type: MessageSegment['type'],
  scope: string,
  unique: string | number
): string => `${scope}:${type}:${String(unique)}`

export const normalizeMessageSegmentsWithIds = (
  segments: MessageSegment[] | undefined,
  scope: string
): MessageSegment[] | undefined => {
  if (!segments?.length) {
    return segments
  }

  let didNormalize = false
  const normalized = segments.map((segment, index) => {
    if (segment.segmentId) {
      return segment
    }

    didNormalize = true
    return {
      ...segment,
      segmentId: buildMessageSegmentId(segment.type, scope, index)
    }
  })

  return didNormalize ? normalized : segments
}

export const normalizeChatMessageSegmentsWithIds = (
  message: ChatMessage,
  scope: string
): ChatMessage => {
  const normalizedSegments = normalizeMessageSegmentsWithIds(message.segments, scope)
  if (normalizedSegments === message.segments) {
    return message
  }

  return {
    ...message,
    segments: normalizedSegments
  }
}

export const normalizeMessageEntitySegmentsWithIds = (
  message: MessageEntity,
  scope: string
): MessageEntity => {
  const normalizedBody = normalizeChatMessageSegmentsWithIds(message.body, scope)
  if (normalizedBody === message.body) {
    return message
  }

  return {
    ...message,
    body: normalizedBody
  }
}

export const assertMessageSegmentsHaveIds = (
  segments: MessageSegment[] | undefined,
  scope: string
): void => {
  for (const [index, segment] of (segments ?? []).entries()) {
    if (!segment.segmentId) {
      throw new Error(`[${scope}] Message segment at index ${index} (${segment.type}) is missing required segmentId`)
    }
  }
}

export const assertChatMessageSegmentsHaveIds = (
  message: ChatMessage,
  scope: string
): void => {
  assertMessageSegmentsHaveIds(message.segments, scope)
}

export const assertMessageEntitySegmentsHaveIds = (
  message: MessageEntity,
  scope: string
): void => {
  assertChatMessageSegmentsHaveIds(message.body, scope)
}

export const assertMessageSegmentPatchHasIds = (
  patch: import('./render-events').MessageSegmentPatch,
  scope: string
): void => {
  assertMessageSegmentsHaveIds([patch.segment], `${scope}:segment`)
  assertMessageSegmentsHaveIds(patch.replaceSegments, `${scope}:replaceSegments`)
}
