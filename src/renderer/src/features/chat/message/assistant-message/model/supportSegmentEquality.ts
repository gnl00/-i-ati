import type { SupportSegmentRenderItem } from './assistantMessageMapper'
import { areToolCallSegmentsEqual } from '../toolcall/ToolCallResult'

export const areSupportSegmentRenderItemsEqual = (
  previous: SupportSegmentRenderItem,
  next: SupportSegmentRenderItem
): boolean => {
  if (
    previous.key !== next.key
    || previous.layer !== next.layer
    || previous.sourceIndex !== next.sourceIndex
    || previous.order !== next.order
    || previous.isStreamingTail !== next.isStreamingTail
    || previous.segment.type !== next.segment.type
  ) {
    return false
  }
  if (previous.segment.type === 'toolCall' && next.segment.type === 'toolCall') {
    return areToolCallSegmentsEqual(previous.segment, next.segment)
  }
  if (previous.segment.type === 'reasoning' && next.segment.type === 'reasoning') {
    return previous.segment.segmentId === next.segment.segmentId
      && previous.segment.content === next.segment.content
      && previous.segment.timestamp === next.segment.timestamp
      && previous.segment.endedAt === next.segment.endedAt
  }
  if (previous.segment.type === 'error' && next.segment.type === 'error') {
    return previous.segment.segmentId === next.segment.segmentId
      && previous.segment.content === next.segment.content
      && previous.segment.error.name === next.segment.error.name
      && previous.segment.error.message === next.segment.error.message
      && previous.segment.error.code === next.segment.error.code
      && previous.segment.error.stack === next.segment.error.stack
      && previous.segment.error.timestamp === next.segment.error.timestamp
  }
  return previous.segment === next.segment
}

export const areSupportSegmentRenderItemListsEqual = (
  previous: SupportSegmentRenderItem[],
  next: SupportSegmentRenderItem[]
): boolean => (
  previous.length === next.length
  && previous.every((item, index) => areSupportSegmentRenderItemsEqual(item, next[index]))
)
