import React, { memo } from 'react'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import { AssistantSupportSegmentContent } from './AssistantSupportSegmentContent'

const areSupportSegmentRenderItemsEqual = (
  previous: SupportSegmentRenderItem[],
  next: SupportSegmentRenderItem[]
): boolean => {
  if (previous.length !== next.length) return false

  return previous.every((item, index) => {
    const nextItem = next[index]
    return item.key === nextItem.key
      && item.layer === nextItem.layer
      && item.sourceIndex === nextItem.sourceIndex
      && item.order === nextItem.order
      && item.segment === nextItem.segment
      && item.isStreamingTail === nextItem.isStreamingTail
  })
}

const AssistantSupportSegmentItem = memo(({
  item
}: {
  item: SupportSegmentRenderItem
}) => (
  <AssistantSupportSegmentContent item={item} />
), (prevProps, nextProps) => areSupportSegmentRenderItemsEqual([prevProps.item], [nextProps.item]))

export const AssistantSupportSegmentList = memo(({
  items
}: {
  items: SupportSegmentRenderItem[]
}) => {
  return items.map((item) => (
    <div key={item.key} style={{ order: item.order }}>
      <AssistantSupportSegmentItem item={item} />
    </div>
  ))
}, (prevProps, nextProps) => areSupportSegmentRenderItemsEqual(prevProps.items, nextProps.items))
