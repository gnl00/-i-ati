export const buildMessageSegmentId = (
  type: MessageSegment['type'],
  scope: string,
  unique: string | number
): string => `${scope}:${type}:${String(unique)}`

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
  patch: import('../run/output-events').MessageSegmentPatch,
  scope: string
): void => {
  assertMessageSegmentsHaveIds([patch.segment], `${scope}:segment`)
  assertMessageSegmentsHaveIds(patch.replaceSegments, `${scope}:replaceSegments`)
}
