import { useChatStore } from '@renderer/store'
import { useSegmentTypewriter } from '@renderer/hooks/useSegmentTypewriter'
import { updateMessage } from '@renderer/db/MessageRepository'
import { useEffect } from 'react'

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
  forceComplete: () => void
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
  const setForceCompleteTypewriter = useChatStore(state => state.setForceCompleteTypewriter)

  const segments = m.segments || []
  const enabled = m.role === 'assistant' && isLatest && !m.typewriterCompleted
  const isStreaming = showLoadingIndicator && isLatest

  const { getSegmentVisibleLength, shouldRenderSegment, isAllComplete, forceComplete } = useSegmentTypewriter(
    segments,
    {
      minSpeed: 5,
      maxSpeed: 20,
      enabled,
      isStreaming,
      onTyping: onTypingChange,
      onAllComplete: async () => {
        // Mark typewriter as completed when all segments are done
        if (!m.typewriterCompleted) {
          // 1. 更新 Zustand store
          const updatedMessages = messages.map((msg, idx) => {
            if (idx === index) {
              return {
                ...msg,
                typewriterCompleted: true
              }
            }
            return msg
          })
          setMessages(updatedMessages)

          // 2. 持久化到数据库（异步，不阻塞 UI）
          // 从 MessageEntity 中获取 id, chatId, chatUuid
          const messageEntity = messages[index]
          if (messageEntity.id) {
            updateMessage({
              id: messageEntity.id,
              chatId: messageEntity.chatId,
              chatUuid: messageEntity.chatUuid,
              body: messageEntity.body
            }).catch(err => {
              console.error('[useMessageTypewriter] Failed to persist typewriterCompleted:', err)
            })
          }
        }
      }
    }
  )

  // 注册 forceComplete 方法到 store，供外部调用
  useEffect(() => {
    if (isLatest && enabled) {
      setForceCompleteTypewriter(forceComplete)
    }

    // 清理：组件卸载或不再是 latest 时，清除注册
    return () => {
      if (isLatest) {
        setForceCompleteTypewriter(null)
      }
    }
  }, [isLatest, enabled, forceComplete, setForceCompleteTypewriter])

  return { segments, getSegmentVisibleLength, shouldRenderSegment, isAllComplete, forceComplete }
}
