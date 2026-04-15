export interface AssistantMessageFacts {
  isOverlayPreview: boolean
  badge: {
    model?: string
    modelRef?: ModelRef
  }
  emotion: {
    label?: string
    emoji?: string
    intensity?: number
  }
  transcript: {
    committedSegments: MessageSegment[]
    previewSegments: MessageSegment[]
  }
  presence: {
    hasContent: boolean
    hasToolCalls: boolean
  }
}

function resolveHeaderEmotion(messages: Array<ChatMessage | undefined>): AssistantMessageFacts['emotion'] {
  const emotion = messages.find(message => message?.emotion)?.emotion

  return {
    label: emotion?.label?.trim(),
    emoji: emotion?.emoji?.trim(),
    intensity: typeof emotion?.intensity === 'number'
      ? emotion.intensity
      : undefined
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

  return {
    isOverlayPreview: Boolean(previewMessage),
    badge: {
      model: displayMessage.model,
      modelRef: displayMessage.modelRef
    },
    emotion: resolveHeaderEmotion([previewMessage, committedMessage]),
    transcript: {
      committedSegments: getVisibleTranscriptSegments(committedMessage),
      previewSegments: getVisibleTranscriptSegments(previewMessage)
    },
    presence: {
      hasContent: hasMessageContent(committedMessage) || hasMessageContent(previewMessage),
      hasToolCalls: getVisibleTranscriptSegments(displayMessage).some(
        (segment): segment is ToolCallSegment => segment.type === 'toolCall'
      )
    }
  }
}
