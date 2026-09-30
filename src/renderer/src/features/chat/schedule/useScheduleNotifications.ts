import { useEffect, useRef } from 'react'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { subscribeScheduleEvents } from '@renderer/infrastructure/ipc'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { toast } from 'sonner'
import type { ScheduleEvent } from '@renderer/infrastructure/ipc'

export function useScheduleNotifications(chatUuid?: string | null): void {
  const chatUuidRef = useRef(chatUuid)
  chatUuidRef.current = chatUuid

  useEffect(() => {
    const unsubscribe = subscribeScheduleEvents((event: ScheduleEvent) => {
      if (event.type === SCHEDULE_EVENTS.RUN_FINISHED) {
        const { task, run } = event.payload
        const targetChatUuid = run.execution_chat_uuid ?? event.chatUuid ?? task.chat_uuid
        const currentChatUuid = useChatStore.getState().currentChatUuid
        if (currentChatUuid === targetChatUuid || (!currentChatUuid && chatUuidRef.current === targetChatUuid)) return
        if (run.status === 'completed') {
          toast.success('Task completed', { description: task.goal })
        } else if (run.status === 'failed') {
          toast.error('Task failed', { description: run.last_error || task.goal })
        }
        return
      }

      if (event.type !== SCHEDULE_EVENTS.UPDATED) return
    })

    return (): void => {
      unsubscribe()

    }
  }, [])
}
