import { useEffect, useState } from 'react'
import { invokeDbScheduledTasksList, subscribeScheduleEvents } from '@renderer/infrastructure/ipc'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import type { ScheduleTask } from '@shared/tools/schedule'

export function useScheduledTasks(): { scheduledTasks: ScheduleTask[]; scheduleLoading: boolean; scheduleLoadError: string; replaceTask: (task: ScheduleTask) => void } {
  const [scheduledTasks, setScheduledTasks] = useState<ScheduleTask[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleLoadError, setScheduleLoadError] = useState('')

  useEffect(() => {
    let disposed = false
    let loading = true
    // Events arriving during the initial read take precedence over its snapshot.
    const updates = new Map<string, ScheduleTask>()
    const unsubscribe = subscribeScheduleEvents(event => {
      if (event.type !== SCHEDULE_EVENTS.UPDATED) return
      const task = event.payload.task
      if (loading) updates.set(task.id, task)
      setScheduledTasks(current => [...current.filter(item => item.id !== task.id), task])
    })
    void invokeDbScheduledTasksList().then(tasks => {
      if (disposed) return
      const merged = new Map(tasks.map(task => [task.id, task]))
      updates.forEach((task, id) => merged.set(id, task))
      setScheduledTasks([...merged.values()])
    }).catch(() => {
      if (!disposed) setScheduleLoadError('Failed to load schedule tasks')
    }).finally(() => {
      loading = false
      updates.clear()
      if (!disposed) setScheduleLoading(false)
    })
    return (): void => {
      disposed = true
      unsubscribe()
    }
  }, [])

  return { scheduledTasks, scheduleLoading, scheduleLoadError,
    replaceTask: (task): void => setScheduledTasks(current => [...current.filter(item => item.id !== task.id), task])
  }
}

export function getNextScheduledTask(tasks: ScheduleTask[]): ScheduleTask | undefined {
  return tasks.filter(task => task.status === 'pending').sort((a, b) => a.run_at - b.run_at)[0]
}
