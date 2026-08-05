export interface AssistantMessageFacts {
  isOverlayPreview: boolean
  badge: {
    model?: string
    modelRef?: ModelRef
  }
  transcript: {
    committedSegments: MessageSegment[]
    previewSegments: MessageSegment[]
  }
  presence: {
    hasContent: boolean
    hasSegments: boolean
    hasToolCalls: boolean
  }
}

function hasMessageContent(message: ChatMessage | undefined): boolean {
  if (typeof message?.content === 'string') {
    return message.content.trim().length > 0
  }

  return Array.isArray(message?.content) && message.content.length > 0
}

function getVisibleTranscriptSegments(message: ChatMessage | undefined): MessageSegment[] {
  return (message?.segments ?? []).filter(
    segment => segment.presentation?.transcriptVisible !== false
  )
}

export function buildAssistantMessageFacts(source: {
  committedMessage: ChatMessage
  previewMessage?: ChatMessage
}): AssistantMessageFacts {
  const { committedMessage, previewMessage } = source
  const displayMessage = previewMessage ?? committedMessage
  const committedSegments = getVisibleTranscriptSegments(committedMessage)
  const previewSegments = getVisibleTranscriptSegments(previewMessage)

  return {
    isOverlayPreview: Boolean(previewMessage),
    badge: {
      model: displayMessage.model,
      modelRef: displayMessage.modelRef
    },
    transcript: {
      committedSegments,
      previewSegments
    },
    presence: {
      hasContent: hasMessageContent(committedMessage) || hasMessageContent(previewMessage),
      hasSegments: committedSegments.length > 0 || previewSegments.length > 0,
      hasToolCalls: getVisibleTranscriptSegments(displayMessage).some(
        (segment): segment is ToolCallSegment => segment.type === 'toolCall'
      )
    }
  }
}
