import { useChatStore } from '@renderer/store'
import { useSegmentTypewriterNext } from '@renderer/hooks/useSegmentTypewriterNext'
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
  // 新增：获取可见的 tokens（用于动效渲染）
  getVisibleTokens: (segIdx: number) => string[]
}

/**
 * Hook to manage typewriter effect for assistant messages.
 * Wraps useSegmentTypewriterNext with message-specific logic and state updates.
 *
 * 优化版本使用 Token 级粒度，提供更自然的打字机效果
 */
export function useMessageTypewriter(
  props: UseMessageTypewriterProps
): UseMessageTypewriterReturn {
  const { index, message: m, isLatest, onTypingChange } = props
  const readStreamState = useChatStore(state => state.readStreamState)
  const setMessages = useChatStore(state => state.setMessages)
  const messages = useChatStore(state => state.messages)
  const setForceCompleteTypewriter = useChatStore(state => state.setForceCompleteTypewriter)

  const segments = m.segments || []
  const enabled = m.role === 'assistant' && isLatest && !m.typewriterCompleted
  const isStreaming = readStreamState && isLatest

  const {
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete,
    forceComplete,
    getVisibleTokens
  } = useSegmentTypewriterNext(
    segments,
    {
      minSpeed: 15,  // Token 级 增大=更慢
      maxSpeed: 30,  // Token 级 增大=更慢
      granularity: 'token',  // 新增：使用 Token 级粒度
      batchUpdateInterval: 50,  // 新增：批量更新间隔
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

  return {
    segments,
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete,
    forceComplete,
    getVisibleTokens
  }
}
