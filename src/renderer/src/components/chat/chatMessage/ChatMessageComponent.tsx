import React, { memo } from 'react'
import { toast } from 'sonner'
import { UserMessage } from './user-message'
import { AssistantMessage } from './assistant-message'
import { useMessageHover } from './user-message/use-message-hover'
import { Send, Timer } from 'lucide-react'

interface ChatMessageComponentProps {
  index: number
  message?: ChatMessage
  pendingAssistantModel?: {
    model?: string
    modelRef?: ModelRef
  }
  previewMessage?: ChatMessage
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
  pendingAssistantModel,
  previewMessage,
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

  if (!message && pendingAssistantModel) {
    return (
      <AssistantMessage
        index={index}
        pendingModel={pendingAssistantModel}
        previewMessage={previewMessage}
        isLatest={isLatest}
        isHovered={hoverState.assistantMessageHovered}
        onHover={hoverState.onMouseHoverAssistantMsg}
        onCopyClick={onCopyClick}
        onTypingChange={onTypingChange}
      />
    )
  }

  if (!message) {
    return null
  }

  if (message.role === 'user' && message.source && message.source == 'schedule') {
    return (
      <>
        {message.source && (
          <div className="flex items-center gap-3 py-2.5">
            <div className="h-px flex-1 bg-slate-200/70 dark:bg-slate-700/70" />
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 shadow-xs shadow-black/5 backdrop-blur-sm dark:bg-slate-900/45">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-100/50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-300">
                <Timer className="h-3 w-3" />
              </span>
              <p className="text-[11px] font-medium leading-none text-slate-500 dark:text-slate-400">
                {typeof message.content === 'string' && message.content.trim()
                  ? message.content
                  : 'Scheduled'}
              </p>
            </div>
            <div className="h-px flex-1 bg-slate-200/70 dark:bg-slate-700/70" />
          </div>
        )}
      </>
    )
  }

  if (message.role === 'assistant' && message.source && message.source === 'telegram' && message.host?.direction === 'outbound') {
    return (
      <>
        <div className="flex items-center gap-3 py-2.5">
          <div className="h-px flex-1 bg-slate-200/70 dark:bg-slate-700/70" />
          <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50/80 px-2.5 py-1 shadow-xs shadow-black/5 backdrop-blur-sm dark:bg-sky-950/35">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-sky-100/80 text-sky-600 dark:bg-sky-900/70 dark:text-sky-300">
              <Send className="h-3 w-3" />
            </span>
            <p className="text-[11px] font-medium leading-none text-sky-700 dark:text-sky-300">
              Sent to Telegram
            </p>
          </div>
          <div className="h-px flex-1 bg-slate-200/70 dark:bg-slate-700/70" />
        </div>
      <AssistantMessage
        index={index}
        committedMessage={message}
        previewMessage={previewMessage}
        isLatest={isLatest}
        isHovered={hoverState.assistantMessageHovered}
        onHover={hoverState.onMouseHoverAssistantMsg}
        onCopyClick={onCopyClick}
        onTypingChange={onTypingChange}
        />
      </>
    )
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
      committedMessage={message}
      previewMessage={previewMessage}
      isLatest={isLatest}
      isHovered={hoverState.assistantMessageHovered}
      onHover={hoverState.onMouseHoverAssistantMsg}
      onCopyClick={onCopyClick}
      onTypingChange={onTypingChange}
    />
  )
})

export default ChatMessageComponent
