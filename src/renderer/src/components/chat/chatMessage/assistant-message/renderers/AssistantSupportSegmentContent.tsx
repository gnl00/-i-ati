import { memo } from 'react'
import { ToolCallResultNextOutput } from '../toolcall/ToolCallResultNextOutput'
import { ErrorMessage } from '../../error-message'
import { ReasoningSegmentNext } from '../segments/ReasoningSegmentNext'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'

export interface AssistantSupportSegmentContentProps {
  item: SupportSegmentRenderItem
}

export const AssistantSupportSegmentContent = memo(({
  item
}: AssistantSupportSegmentContentProps) => {
  const { segment, key, isStreamingTail } = item

  if (segment.type === 'reasoning') {
    return (
      <ReasoningSegmentNext
        key={key}
        segment={segment}
        isStreaming={isStreamingTail}
      />
    )
  }

  if (segment.type === 'toolCall') {
    return <ToolCallResultNextOutput key={key} toolCall={segment} index={item.sourceIndex} />
  }

  if (segment.type === 'error') {
    return <ErrorMessage key={key} error={segment.error} />
  }

  return null
})
