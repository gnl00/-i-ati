import React, { memo } from 'react'
import { useMessageTypewriter } from '../../typewriter/use-message-typewriter'
import { AssistantTextSegmentContent } from './AssistantTextSegmentContent'
import type { TextSegmentRenderItem } from '../model/assistantMessageMapper'
import type { AssistantMessageTextPlaybackInput } from '../model/assistantMessageTextPlayback'

const areTextSegmentRenderItemsEqual = (
  previous: TextSegmentRenderItem[],
  next: TextSegmentRenderItem[]
): boolean => {
  if (previous.length !== next.length) return false

  return previous.every((item, index) => {
    const nextItem = next[index]
    return item.key === nextItem.key
      && item.layer === nextItem.layer
      && item.sourceIndex === nextItem.sourceIndex
      && item.order === nextItem.order
      && item.segment === nextItem.segment
  })
}

const AssistantTextSegmentItem = memo(({
  item,
  typewriter,
  isOverlayPreview
}: {
  item: TextSegmentRenderItem
  typewriter: ReturnType<typeof useMessageTypewriter>
  isOverlayPreview: boolean
}) => {
  const { segment, key, layer, sourceIndex } = item
  const isTypedLayer = layer === 'preview' || !isOverlayPreview
  if (isTypedLayer && !typewriter.shouldRenderSegment(sourceIndex)) {
    return null
  }

  const visibleTokenCount = isTypedLayer ? typewriter.getSegmentVisibleLength(sourceIndex) : Infinity
  const isTyping = visibleTokenCount !== Infinity
  const visibleTokens = isTyping ? typewriter.getVisibleTokens(sourceIndex) : undefined

  return <AssistantTextSegmentContent key={key} segment={segment} visibleTokens={visibleTokens} isTyping={isTyping} />
})

export const AssistantTextSegmentList = memo(({
  index,
  committedPlaybackInput,
  previewPlaybackInput,
  isLatest,
  onTypingChange,
  items,
  isOverlayPreview
}: {
  index: number
  committedPlaybackInput: AssistantMessageTextPlaybackInput
  previewPlaybackInput: AssistantMessageTextPlaybackInput
  isLatest: boolean
  onTypingChange?: () => void
  items: TextSegmentRenderItem[]
  isOverlayPreview: boolean
}) => {
  const committedTypewriter = useMessageTypewriter({
    index,
    message: committedPlaybackInput,
    isLatest,
    onTypingChange
  })
  const previewTypewriter = useMessageTypewriter({
    index,
    message: previewPlaybackInput,
    isLatest,
    onTypingChange
  })

  return items.map((item) => {
    const typewriter = item.layer === 'preview' ? previewTypewriter : committedTypewriter

    return (
      <div key={item.key} style={{ order: item.order }}>
        <AssistantTextSegmentItem
          item={item}
          typewriter={typewriter}
          isOverlayPreview={isOverlayPreview}
        />
      </div>
    )
  })
}, (prevProps, nextProps) => (
  prevProps.index === nextProps.index
  && prevProps.committedPlaybackInput === nextProps.committedPlaybackInput
  && prevProps.previewPlaybackInput === nextProps.previewPlaybackInput
  && prevProps.isLatest === nextProps.isLatest
  && prevProps.onTypingChange === nextProps.onTypingChange
  && prevProps.isOverlayPreview === nextProps.isOverlayPreview
  && areTextSegmentRenderItemsEqual(prevProps.items, nextProps.items)
))
