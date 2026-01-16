import { useChatStore } from '@renderer/store'
import { useSegmentTypewriterNext } from '@renderer/hooks/useSegmentTypewriterNext'
import { updateMessage } from '@renderer/db/MessageRepository'
import { useCallback, useEffect, useRef } from 'react'

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
  isStreaming: boolean
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
  const upsertMessage = useChatStore(state => state.upsertMessage)
  const setForceCompleteTypewriter = useChatStore(state => state.setForceCompleteTypewriter)

  const segments = m.segments || []
  const enabled = m.role === 'assistant' && isLatest && !m.typewriterCompleted
  const isStreaming = readStreamState && isLatest
  const typingDebounceRef = useRef<number | null>(null)

  const handleTypingChange = useCallback(() => {
    if (!onTypingChange) return

    if (!isStreaming) {
      onTypingChange()
      return
    }

    if (typingDebounceRef.current !== null) return
    typingDebounceRef.current = window.setTimeout(() => {
      typingDebounceRef.current = null
      onTypingChange()
    }, 50)
  }, [onTypingChange, isStreaming])

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
      batchUpdateInterval: isStreaming ? 32 : 16,  // Streaming 时降低更新频率减轻重渲染压力
      enabled,
      isStreaming,
      onTyping: handleTypingChange,
      onAllComplete: async () => {
        // Mark typewriter as completed when all segments are done
        if (!m.typewriterCompleted) {
          const messageEntity = useChatStore.getState().messages[index]
          if (!messageEntity) return
          if (!messageEntity.id) {
            console.warn('[useMessageTypewriter] Cannot persist typewriterCompleted without id')
            return
          }

          const updatedMessage: MessageEntity = {
            ...messageEntity,
            body: {
              ...messageEntity.body,
              typewriterCompleted: true
            }
          }

          // 1. 更新 Zustand store（仅更新当前消息）
          upsertMessage(updatedMessage)

          // 2. 持久化到数据库（异步，不阻塞 UI）
          updateMessage({
            id: updatedMessage.id,
            chatId: updatedMessage.chatId,
            chatUuid: updatedMessage.chatUuid,
            body: updatedMessage.body
          }).catch(err => {
            console.error('[useMessageTypewriter] Failed to persist typewriterCompleted:', err)
          })
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

  useEffect(() => {
    return () => {
      if (typingDebounceRef.current !== null) {
        clearTimeout(typingDebounceRef.current)
        typingDebounceRef.current = null
      }
    }
  }, [])

  return {
    segments,
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete,
    forceComplete,
    isStreaming,
    getVisibleTokens
  }
}
