import { useChatStore } from '@renderer/features/chat/state/chatStore'
import type { SegmentTypewriterRenderState } from '@renderer/features/chat/message/typewriter/useSegmentTypewriter'
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
  playbackEnabled?: boolean
  onTypingChange?: () => void
}

export interface UseMessageTypewriterReturn {
  getSegmentState: (segmentId: string) => SegmentTypewriterRenderState
  isAllComplete: boolean
  forceComplete: () => void
  isStreaming: boolean
}

/**
 * Hook to manage typewriter effect for assistant messages.
 * Wraps useSegmentTypewriter with message-specific logic and state updates.
 *
 * 优化版本使用 Token 级粒度，提供更自然的打字机效果
 */
export function useMessageTypewriter(
  props: UseMessageTypewriterProps
): UseMessageTypewriterReturn {
  const { index, message: m, isLatest, playbackEnabled = true, onTypingChange } = props
  const runPhase = useChatStore(state => state.runPhase)

  const segments = m.segments || []
  const enabled = playbackEnabled && m.role === 'assistant' && isLatest && !m.typewriterCompleted
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
    getSegmentState,
    isAllComplete,
    forceComplete
  } = playback

  useMessageTypewriterEffects({
    isLatest,
    enabled,
    forceComplete
  })

  return {
    getSegmentState,
    isAllComplete,
    forceComplete,
    isStreaming
  }
}
