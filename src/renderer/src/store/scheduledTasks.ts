import { create } from 'zustand'
import type { ScheduleTask } from '@shared/tools/schedule'

type ScheduledTasksState = {
  tasksByChatUuid: Record<string, ScheduleTask[]>
}

type ScheduledTasksActions = {
  setTasksForChat: (chatUuid: string, tasks: ScheduleTask[]) => void
  upsertTask: (task: ScheduleTask) => void
}

export const useScheduledTasksStore = create<ScheduledTasksState & ScheduledTasksActions>((set, get) => ({
  tasksByChatUuid: {},
  setTasksForChat: (chatUuid, tasks) =>
    set(state => ({
      tasksByChatUuid: {
        ...state.tasksByChatUuid,
        [chatUuid]: tasks
      }
    })),
  upsertTask: (task) => {
    const state = get()
    const list = state.tasksByChatUuid[task.chat_uuid] || []
    const index = list.findIndex(item => item.id === task.id)
    const next = index >= 0
      ? [...list.slice(0, index), task, ...list.slice(index + 1)]
      : [task, ...list]
    set({
      tasksByChatUuid: {
        ...state.tasksByChatUuid,
        [task.chat_uuid]: next
      }
    })
  }
}))
