import { ArrowUpRight, CalendarClock } from 'lucide-react'
import { useChatStore } from '../state/chatStore'
import { useSheetStore } from '../state/sheetStore'
import { getNextScheduledTask, useScheduledTasks } from './useScheduledTasks'

export function NextTaskSummary(): React.ReactElement {
  const { scheduledTasks, scheduleLoading, scheduleLoadError } = useScheduledTasks()
  const nextTask = getNextScheduledTask(scheduledTasks)
  return (
    <button
      type="button"
      aria-label="Open Tasks"
      onClick={() => {
        useSheetStore.getState().setSheetOpenState(false)
        useChatStore.getState().setTasksPageOpen(true)
      }}
      className="shrink-0 rounded-xl border border-(--app-border-standard) bg-(--app-surface-raised) p-3 text-left text-slate-600 transition-colors hover:bg-(--app-surface-hover) active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent) dark:text-(--app-text-body)"
    >
      <span className="flex items-center justify-between text-[11px] font-semibold tracking-wide text-slate-500 dark:text-(--app-text-muted)">
        TASK BOARD <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </span>
      <span className="mt-2 block line-clamp-2 wrap-break-word text-xs font-semibold leading-5 dark:text-(--app-text-primary)">
        {scheduleLoading ? 'Loading schedules...' : scheduleLoadError || nextTask?.goal || '暂无待执行任务'}
      </span>
      {nextTask && !scheduleLoading && !scheduleLoadError && (
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-(--app-text-secondary)">
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" />NEXT RUN</span>
          <time dateTime={new Date(nextTask.run_at).toISOString()} className="font-semibold tabular-nums">
            {new Date(nextTask.run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
          </time>
        </span>
      )}
    </button>
  )
}
