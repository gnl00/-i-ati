import { cn } from '@renderer/lib/utils'
import React, { useMemo } from 'react'
import type { ScheduleTask } from '@shared/tools/schedule'

interface SummaryMeta {
  label: string
  valueClassName: string
  dotClassName: string
}

type SummaryKey = 'running' | 'pending' | 'done' | 'failure'

const SUMMARY_META: Record<SummaryKey, SummaryMeta> = {
  running: {
    label: 'Running',
    valueClassName: 'text-sky-700 dark:text-sky-300',
    dotClassName: 'bg-sky-500'
  },
  pending: {
    label: 'Pending',
    valueClassName: 'text-amber-700 dark:text-amber-300',
    dotClassName: 'bg-amber-500'
  },
  done: {
    label: 'Done',
    valueClassName: 'text-emerald-700 dark:text-emerald-300',
    dotClassName: 'bg-emerald-500'
  },
  failure: {
    label: 'Failure',
    valueClassName: 'text-rose-700 dark:text-rose-300',
    dotClassName: 'bg-rose-500'
  }
}

interface ChatScheduleBoardProps {
  scheduledTasks: ScheduleTask[]
  scheduleLoading: boolean
  scheduleLoadError: string
}

const ChatScheduleBoard: React.FC<ChatScheduleBoardProps> = ({
  scheduledTasks,
  scheduleLoading,
  scheduleLoadError
}) => {
  const scheduleSummary = useMemo(() => {
    return scheduledTasks.reduce<Record<SummaryKey, number>>((acc, task) => {
      if (task.status === 'running') {
        acc.running += 1
      } else if (task.status === 'pending') {
        acc.pending += 1
      } else if (task.status === 'completed') {
        acc.done += 1
      } else if (task.status === 'failed') {
        acc.failure += 1
      }
      return acc
    }, { running: 0, pending: 0, done: 0, failure: 0 })
  }, [scheduledTasks])

  const currentTaskGoal = useMemo(() => {
    if (scheduledTasks.length === 0) return ''
    const runningTask = scheduledTasks.find(task => task.status === 'running')
    if (runningTask) return runningTask.goal
    const pendingTask = scheduledTasks.find(task => task.status === 'pending')
    if (pendingTask) return pendingTask.goal
    const finishedTask = [...scheduledTasks]
      .filter(task => task.status === 'completed' || task.status === 'failed')
      .sort((a, b) => b.updated_at - a.updated_at)[0]
    return finishedTask?.goal ?? scheduledTasks[0].goal
  }, [scheduledTasks])

  return (
    <div className="shrink-0 px-4 pt-2 border rounded-xl bg-linear-to-b from-slate-50/70 to-transparent dark:from-slate-900/30">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Task Board</h3>
      </div>

      <div className="overflow-hidden">
        <div className="grid grid-cols-4 gap-2 pb-2">
          {(Object.keys(SUMMARY_META) as SummaryKey[]).map(key => {
            const meta = SUMMARY_META[key]
            return (
              <div key={key} className="rounded-lg border border-slate-200/80 dark:border-slate-700/70 px-2 py-2 bg-white/80 dark:bg-slate-900/50">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className={cn('w-1.5 h-1.5 rounded-full', meta.dotClassName)} />
                  <span>{meta.label}</span>
                </div>
                <div className={cn('mt-1 text-lg leading-none font-semibold tracking-tight', meta.valueClassName)}>
                  {scheduleSummary[key]}
                </div>
              </div>
            )
          })}
        </div>

        {scheduleLoading ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">Loading schedules...</div>
        ) : scheduleLoadError ? (
          <div className="flex items-center justify-center h-20 text-sm text-rose-500">{scheduleLoadError}</div>
        ) : (
          <div className="pb-2">
            <div className="rounded-lg border border-dashed border-slate-300/90 dark:border-slate-700/80 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
              {scheduledTasks.length === 0 ? 'No scheduled tasks' : currentTaskGoal}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatScheduleBoard
