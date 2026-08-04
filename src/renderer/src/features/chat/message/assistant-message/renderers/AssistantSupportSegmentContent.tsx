import { memo } from 'react'
import { ToolCallResult } from '../toolcall/ToolCallResult'
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
    return <ToolCallResult key={key} toolCall={segment} index={item.sourceIndex} />
  }

  if (segment.type === 'error') {
    return <ErrorMessage key={key} error={segment.error} />
  }

  return null
})
