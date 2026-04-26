import { memo } from 'react'
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
  shouldRender,
  visibleText,
  isTyping
}: {
  item: TextSegmentRenderItem
  shouldRender: boolean
  visibleText?: string
  isTyping: boolean
}) => {
  if (!shouldRender) {
    return null
  }

  return <AssistantTextSegmentContent segment={item.segment} visibleText={visibleText} isTyping={isTyping} />
}, (prevProps, nextProps) => (
  prevProps.item.key === nextProps.item.key
  && prevProps.item.layer === nextProps.item.layer
  && prevProps.item.sourceIndex === nextProps.item.sourceIndex
  && prevProps.item.order === nextProps.item.order
  && prevProps.item.segment === nextProps.item.segment
  && prevProps.shouldRender === nextProps.shouldRender
  && prevProps.visibleText === nextProps.visibleText
  && prevProps.isTyping === nextProps.isTyping
))

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
    playbackEnabled: !isOverlayPreview,
    onTypingChange
  })
  const previewTypewriter = useMessageTypewriter({
    index,
    message: previewPlaybackInput,
    isLatest,
    playbackEnabled: isOverlayPreview,
    onTypingChange
  })

  return items.map((item) => {
    const typewriter = item.layer === 'preview' ? previewTypewriter : committedTypewriter
    const isTypedLayer = item.layer === 'preview' || !isOverlayPreview
    const shouldRender = !isTypedLayer || typewriter.shouldRenderSegment(item.sourceIndex)
    const visibleLength = isTypedLayer && shouldRender
      ? typewriter.getSegmentVisibleLength(item.sourceIndex)
      : Infinity
    const isTyping = visibleLength !== Infinity
    const visibleText = isTyping
      ? typewriter.getVisibleTokens(item.sourceIndex).join('')
      : undefined

    return (
      <div key={item.key} style={{ order: item.order }}>
        <AssistantTextSegmentItem
          item={item}
          shouldRender={shouldRender}
          visibleText={visibleText}
          isTyping={isTyping}
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
