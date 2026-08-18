import { useEffect } from 'react'
import { subscribeRunEvents } from '@renderer/infrastructure/ipc'
import { useToolUserQuestionStore } from '@renderer/features/chat/state/toolUserQuestionStore'
import type { RunEvent } from '@shared/run/events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'

export function useToolUserQuestions(chatUuid?: string | null): void {
  const enqueue = useToolUserQuestionStore(state => state.enqueue)
  const dequeue = useToolUserQuestionStore(state => state.dequeue)
  const hydrate = useToolUserQuestionStore(state => state.hydrate)
  const clear = useToolUserQuestionStore(state => state.clear)

  useEffect(() => {
    if (chatUuid) {
      void hydrate(chatUuid)
    } else {
      clear()
    }

    const unsubscribe = subscribeRunEvents((event: RunEvent) => {
      if (chatUuid && event.chatUuid && event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === RUN_TOOL_EVENTS.TOOL_USER_QUESTION_REQUIRED) {
        if (!event.chatUuid) {
          return
        }
        enqueue({
          submissionId: event.submissionId,
          chatUuid: event.chatUuid,
          ...event.payload
        })
        return
      }

      if (event.type === RUN_TOOL_EVENTS.TOOL_USER_QUESTION_RESOLVED) {
        dequeue(event.payload.interactionId)
      }
    })

    return () => {
      unsubscribe()
      clear()
    }
  }, [chatUuid, clear, dequeue, enqueue, hydrate])
}
