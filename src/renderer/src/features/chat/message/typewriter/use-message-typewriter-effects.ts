import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { useCallback, useEffect } from 'react'

interface MessageTypewriterEffectsProps {
  isLatest: boolean
  enabled: boolean
  forceComplete: () => void
}

interface PersistTypewriterCompletionProps {
  index: number
  message: Pick<ChatMessage, 'source' | 'typewriterCompleted'>
}

export function usePersistTypewriterCompletion(
  props: PersistTypewriterCompletionProps
) {
  const { index, message } = props
  const upsertMessage = useChatStore(state => state.upsertMessage)
  const patchMessageUiState = useChatStore(state => state.patchMessageUiState)

  return useCallback(() => {
    if (message.typewriterCompleted || message.source === MESSAGE_SOURCE.STREAM_PREVIEW) {
      return
    }

    const messageEntity = useChatStore.getState().messages[index]
    if (!messageEntity) return
    if (messageEntity.id == null) {
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

    upsertMessage(updatedMessage)
    patchMessageUiState(messageEntity.id, { typewriterCompleted: true }).catch(err => {
      console.error('[useMessageTypewriter] Failed to patch typewriterCompleted:', err)
    })
  }, [index, message, patchMessageUiState, upsertMessage])
}

export function useMessageTypewriterEffects(
  props: MessageTypewriterEffectsProps
) {
  const { isLatest, enabled, forceComplete } = props
  const setForceCompleteTypewriter = useChatStore(state => state.setForceCompleteTypewriter)

  useEffect(() => {
    if (isLatest && enabled) {
      setForceCompleteTypewriter(forceComplete)
    }

    return () => {
      if (isLatest) {
        setForceCompleteTypewriter(null)
      }
    }
  }, [isLatest, enabled, forceComplete, setForceCompleteTypewriter])
}
