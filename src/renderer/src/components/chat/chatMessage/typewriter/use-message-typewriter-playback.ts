import { useSegmentTypewriterNext } from '@renderer/hooks/useSegmentTypewriterNext'
import { useCallback, useEffect, useRef } from 'react'

export interface MessageTypewriterPlaybackProps {
  segments: TextSegment[]
  enabled: boolean
  isStreaming: boolean
  onTypingChange?: () => void
  onAllComplete?: () => void
}

export function useMessageTypewriterPlayback(
  props: MessageTypewriterPlaybackProps
) {
  const { segments, enabled, isStreaming, onTypingChange, onAllComplete } = props
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

  const playback = useSegmentTypewriterNext(
    segments,
    {
      minSpeed: 15,
      maxSpeed: 30,
      granularity: 'token',
      batchUpdateInterval: isStreaming ? 32 : 16,
      enabled,
      isStreaming,
      onTyping: handleTypingChange,
      onAllComplete
    }
  )

  useEffect(() => {
    return () => {
      if (typingDebounceRef.current !== null) {
        clearTimeout(typingDebounceRef.current)
        typingDebounceRef.current = null
      }
    }
  }, [])

  return playback
}
