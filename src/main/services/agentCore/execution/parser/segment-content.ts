export function extractContentFromSegments(
  segments: MessageSegment[] | undefined
): string {
  if (!segments || segments.length === 0) {
    return ''
  }

  return segments
    .filter(seg => seg.type === 'text')
    .map(seg => seg.content)
    .join('')
}

export function extractReasoningFromSegments(
  segments: MessageSegment[] | undefined
): string {
  if (!segments || segments.length === 0) {
    return ''
  }

  return segments
    .filter(seg => seg.type === 'reasoning')
    .map(seg => seg.content)
    .join('')
}

export function hasContentInSegments(
  segments: MessageSegment[] | undefined
): boolean {
  if (!segments || segments.length === 0) {
    return false
  }

  return segments.some(seg =>
    (seg.type === 'text' || seg.type === 'reasoning') &&
    seg.content &&
    seg.content.trim().length > 0
  )
}
