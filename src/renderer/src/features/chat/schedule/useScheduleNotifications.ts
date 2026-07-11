import { useEffect, useRef } from 'react'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { subscribeScheduleEvents } from '@renderer/infrastructure/ipc'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { toast } from 'sonner'
import type { ScheduleTask, ScheduleTaskStatus } from '@shared/tools/schedule'
import type { ScheduleEvent } from '@renderer/infrastructure/ipc'

const TERMINAL_SCHEDULE_STATUSES = new Set<ScheduleTaskStatus>([
  'completed',
  'failed',
  'cancelled',
  'dismissed'
])

function isTerminalScheduleTask(task: ScheduleTask): boolean {
  return TERMINAL_SCHEDULE_STATUSES.has(task.status)
}

export function useScheduleNotifications(chatUuid?: string | null): void {
  const upsertMessage = useChatStore(state => state.upsertMessage)
  const setRunPhaseForChat = useChatStore(state => state.setRunPhaseForChat)
  const getRunStatusForChat = useChatStore(state => state.getRunStatusForChat)
  const ownedRunPhaseTaskIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsubscribe = subscribeScheduleEvents((event: ScheduleEvent) => {
      if (event.type === SCHEDULE_EVENTS.STARTED) {
        const task = event.payload?.task
        if (!task?.chat_uuid) return

        if (chatUuid && task.chat_uuid === chatUuid) {
          const status = getRunStatusForChat(task.chat_uuid)
          if (status.runPhase === 'idle') {
            ownedRunPhaseTaskIdsRef.current.add(task.id)
            setRunPhaseForChat(task.chat_uuid, 'submitting')
          }
        }
        return
      }

      if (event.type === SCHEDULE_EVENTS.MESSAGE_CREATED) {
        const message = event.payload?.message
        if (!message) return
        if (chatUuid && message.chatUuid === chatUuid) {
          upsertMessage(message)
        }
        return
      }
      if (event.type === SCHEDULE_EVENTS.MESSAGE_UPDATED) {
        const message = event.payload?.message
        if (!message) return
        if (chatUuid && message.chatUuid === chatUuid) {
          upsertMessage(message)
        }
        return
      }
      if (event.type !== SCHEDULE_EVENTS.UPDATED) return
      const task = event.payload?.task
      if (!task?.chat_uuid) return

      if (isTerminalScheduleTask(task) && ownedRunPhaseTaskIdsRef.current.has(task.id)) {
        ownedRunPhaseTaskIdsRef.current.delete(task.id)
        setRunPhaseForChat(task.chat_uuid, 'idle')
      }

      if (chatUuid && task.chat_uuid === chatUuid) {
        return
      }

      if (task.status === 'completed') {
        toast.success('任务已完成', { description: task.goal })
      } else if (task.status === 'failed') {
        toast.error('任务执行失败', { description: task.last_error || task.goal })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [chatUuid, getRunStatusForChat, setRunPhaseForChat, upsertMessage])
}
