import { useChatStore } from '@renderer/store/chatStore'
import { useMessageTypewriterPlayback } from './use-message-typewriter-playback'
import {
  useMessageTypewriterEffects,
  usePersistTypewriterCompletion
} from './use-message-typewriter-effects'

export interface MessageTypewriterInput {
  role: ChatMessage['role']
  source?: ChatMessage['source']
  typewriterCompleted?: ChatMessage['typewriterCompleted']
  segments: TextSegment[]
}

export interface UseMessageTypewriterProps {
  index: number
  message: MessageTypewriterInput
  isLatest: boolean
  onTypingChange?: () => void
}

export interface UseMessageTypewriterReturn {
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
  const runPhase = useChatStore(state => state.runPhase)

  const segments = m.segments || []
  const enabled = m.role === 'assistant' && isLatest && !m.typewriterCompleted
  const isStreaming = runPhase === 'streaming' && isLatest

  const handlePlaybackComplete = usePersistTypewriterCompletion({
    index,
    message: m
  })

  const playback = useMessageTypewriterPlayback({
    segments,
    enabled,
    isStreaming,
    onTypingChange,
    onAllComplete: handlePlaybackComplete
  })

  const {
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete,
    forceComplete,
    getVisibleTokens
  } = playback

  useMessageTypewriterEffects({
    isLatest,
    enabled,
    forceComplete
  })

  return {
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete,
    forceComplete,
    isStreaming,
    getVisibleTokens
  }
}
