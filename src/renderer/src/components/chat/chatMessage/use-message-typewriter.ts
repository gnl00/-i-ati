import { useChatStore } from '@renderer/store'
import { useSegmentTypewriter } from '@renderer/hooks/useSegmentTypewriter'

export interface UseMessageTypewriterProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  onTypingChange?: () => void
}

export interface UseMessageTypewriterReturn {
  segments: MessageSegment[]
  getSegmentVisibleLength: (segIdx: number) => number
  shouldRenderSegment: (segIdx: number) => boolean
  isAllComplete: boolean
}

/**
 * Hook to manage typewriter effect for assistant messages.
 * Wraps useSegmentTypewriter with message-specific logic and state updates.
 */
export function useMessageTypewriter(
  props: UseMessageTypewriterProps
): UseMessageTypewriterReturn {
  const { index, message: m, isLatest, onTypingChange } = props
  const showLoadingIndicator = useChatStore(state => state.showLoadingIndicator)
  const setMessages = useChatStore(state => state.setMessages)
  const messages = useChatStore(state => state.messages)

  const segments = m.segments || []
  const enabled = m.role === 'assistant' && isLatest && !m.typewriterCompleted
  const isStreaming = showLoadingIndicator && isLatest

  const { getSegmentVisibleLength, shouldRenderSegment, isAllComplete } = useSegmentTypewriter(
    segments,
    {
      minSpeed: 5,
      maxSpeed: 20,
      enabled,
      isStreaming,
      onTyping: onTypingChange,
      onAllComplete: () => {
        // Mark typewriter as completed when all segments are done
        if (!m.typewriterCompleted) {
          const updatedMessages = messages.map((msg, idx) => {
            if (idx === index) {
              return {
                ...msg,
                body: {
                  ...msg.body,
                  typewriterCompleted: true
                }
              }
            }
            return msg
          })
          setMessages(updatedMessages)
        }
      }
    }
  )

  return { segments, getSegmentVisibleLength, shouldRenderSegment, isAllComplete }
}
