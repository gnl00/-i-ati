import { memo } from 'react'
import { ToolCallGroup } from '../toolcall/ToolCallGroup'
import { ErrorMessage } from '../../error-message'
import { ReasoningSegment } from '../segments/ReasoningSegment'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'

export interface AssistantSupportSegmentContentProps {
  item: SupportSegmentRenderItem
  fullWidth?: boolean
  nestedDisclosure?: boolean
  onTypingChange?: () => void
}

export const AssistantSupportSegmentContent = memo(({
  item,
  fullWidth = false,
  nestedDisclosure = false,
  onTypingChange
}: AssistantSupportSegmentContentProps) => {
  const { segment, key, isStreamingTail } = item

  if (segment.type === 'reasoning') {
    return (
      <ReasoningSegment
        key={key}
        segment={segment}
        isStreaming={isStreamingTail}
        fullWidth={fullWidth}
        nestedDisclosure={nestedDisclosure}
        onTypingChange={onTypingChange}
      />
    )
  }

  if (segment.type === 'toolCall') {
    return <ToolCallGroup key={key} items={[item]} fullWidth={fullWidth} nestedDisclosure={nestedDisclosure} />
  }

  if (segment.type === 'error') {
    return <ErrorMessage key={key} error={segment.error} />
  }

  return null
})
