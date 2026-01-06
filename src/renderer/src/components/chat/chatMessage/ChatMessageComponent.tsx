import React, { memo } from 'react'
import { toast } from 'sonner'
import { UserMessage } from './user-message'
import { AssistantMessage } from './assistant-message'
import { useMessageHover } from './use-message-hover'

interface ChatMessageComponentProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  onTypingChange?: () => void
}

/**
 * Chat message component that routes to UserMessage or AssistantMessage.
 * Simplified router component that manages hover state and copy functionality.
 */
const ChatMessageComponent: React.FC<ChatMessageComponentProps> = memo(({
  index,
  message,
  isLatest,
  onTypingChange
}) => {
  const hoverState = useMessageHover()

  const onCopyClick = (content: string) => {
    if (content) {
      navigator.clipboard.writeText(content)
      toast.success('Copied', { duration: 800 })
    }
  }

  if (message.role === 'user') {
    return (
      <UserMessage
        index={index}
        message={message}
        isLatest={isLatest}
        isHovered={hoverState.userMessageOperationIdx === index}
        onHover={hoverState.onMouseHoverUsrMsg}
        onCopyClick={onCopyClick}
      />
    )
  }

  return (
    <AssistantMessage
      index={index}
      message={message}
      isLatest={isLatest}
      isHovered={hoverState.assistantMessageHovered}
      onHover={hoverState.onMouseHoverAssistantMsg}
      onCopyClick={onCopyClick}
      onTypingChange={onTypingChange}
    />
  )
})

export default ChatMessageComponent
