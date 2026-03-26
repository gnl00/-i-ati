import { useEffect } from 'react'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { invokeDbScheduledTasksByChatUuid, subscribeScheduleEvents } from '@renderer/invoker/ipcInvoker'
import { useChatStore } from '@renderer/store/chatStore'
import { useScheduledTasksStore } from '@renderer/store/scheduledTasks'
import { toast } from 'sonner'
import type { ScheduleEvent } from '@renderer/invoker/ipcInvoker'

export function useScheduleNotifications(chatUuid?: string | null): void {
  const upsertTask = useScheduledTasksStore(state => state.upsertTask)
  const setTasksForChat = useScheduledTasksStore(state => state.setTasksForChat)
  const upsertMessage = useChatStore(state => state.upsertMessage)

  useEffect(() => {
    if (chatUuid) {
      invokeDbScheduledTasksByChatUuid(chatUuid)
        .then(tasks => {
          setTasksForChat(chatUuid, tasks)
        })
        .catch(() => {
          setTasksForChat(chatUuid, [])
        })
    }

    const unsubscribe = subscribeScheduleEvents((event: ScheduleEvent) => {
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

      upsertTask(task)

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
  }, [chatUuid, upsertMessage, upsertTask, setTasksForChat])
}
