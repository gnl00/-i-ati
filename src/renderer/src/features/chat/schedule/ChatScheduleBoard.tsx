import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Loader2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { invokeDbMessageGetById, invokeDbScheduledTaskUpdateStatus } from '@renderer/infrastructure/ipc'
import { cn } from '@renderer/shared/lib/utils'
import type { ScheduleTask } from '@shared/tools/schedule'
import { useScheduledTasks } from './useScheduledTasks'
import { getAllChat } from '@renderer/infrastructure/persistence/ChatRepository'
import { useChatStore } from '../state/chatStore'
import { useSheetStore } from '../state/sheetStore'
import { switchWorkspace } from '@renderer/features/workspace'

export function scheduleLabel(task: ScheduleTask): string {
  if (task.schedule_type !== 'cron') return 'One time'
  const fields = task.cron_expression?.trim().split(/\s+/) ?? []
  const [minute, hour, day, month, weekday] = fields
  if (
    fields.length === 5 &&
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    Number(minute) < 60 &&
    Number(hour) < 24 &&
    day === '*' &&
    month === '*' &&
    weekday === '*'
  ) {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  }
  return task.cron_expression ? `Cron: ${task.cron_expression}` : 'Recurring'
}

export function taskTime(timestamp: number, now = new Date()): string {
  const date = new Date(timestamp)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const day =
    date.toDateString() === now.toDateString()
      ? 'Today'
      : date.toDateString() === tomorrow.toDateString()
        ? 'Tomorrow'
        : date.toLocaleDateString('en-US', {
            ...(date.getFullYear() !== now.getFullYear()
              ? { year: 'numeric' as const }
              : {}),
            month: 'short',
            day: 'numeric'
          })
  return `${day} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

const STATUS = {
  running: {
    label: 'Running',
    Icon: Loader2,
    color: 'text-sky-600 dark:text-sky-300'
  },
  pending: {
    label: 'Pending',
    Icon: Clock3,
    color: 'text-amber-600 dark:text-amber-300'
  },
  completed: {
    label: 'Completed',
    Icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-300'
  },
  failed: {
    label: 'Failed',
    Icon: XCircle,
    color: 'text-rose-600 dark:text-rose-300'
  }
} as const

type VisibleStatus = keyof typeof STATUS
type Filter = 'all' | 'active' | 'history'
const priority: Record<VisibleStatus, number> = {
  running: 0,
  pending: 1,
  failed: 2,
  completed: 3
}
const isVisible = (
  task: ScheduleTask
): task is ScheduleTask & { status: VisibleStatus } => task.status in STATUS
const actionClass =
  'inline-flex h-7 shrink-0 gap-1 px-2 text-[11px] whitespace-nowrap items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-(--app-surface-hover) active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent) disabled:opacity-50 dark:text-(--app-text-secondary)'

export default function ChatScheduleBoard(): React.ReactElement {
  const { scheduledTasks, scheduleLoading, scheduleLoadError, replaceTask } =
    useScheduledTasks()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [openingChat, setOpeningChat] = useState(false)
  const navigationRequest = useRef(0)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return (): void => {
      window.clearInterval(timer)
      navigationRequest.current += 1
    }
  }, [])
  const openChat = async (resultMessageId: number): Promise<void> => {
    const request = ++navigationRequest.current
    const epoch = useChatStore.getState().getSelectionEpoch()
    const isCurrent = (): boolean =>
      navigationRequest.current === request &&
      useChatStore.getState().tasksPageOpen &&
      useChatStore.getState().getSelectionEpoch() === epoch &&
      !useSheetStore.getState().sheetOpenState
    setOpeningChat(true)
    try {
      const message = await invokeDbMessageGetById(resultMessageId)
      if (!isCurrent()) return
      const chatUuid = message?.chatUuid
      if (!chatUuid) throw new Error('The execution chat is no longer available')
      if (useChatStore.getState().currentChatUuid === chatUuid) {
        useChatStore.getState().setTasksPageOpen(false)
        return
      }
      const chat = (await getAllChat()).find((item) => item.uuid === chatUuid)
      if (!isCurrent()) return
      if (!chat?.id) throw new Error('The execution chat is no longer available')
      const workspace = await switchWorkspace(chat.uuid, chat.workspacePath)
      if (!isCurrent()) return
      if (!workspace.success)
        throw new Error(workspace.error || 'Unable to open workspace')
      await useChatStore.getState().hydrateChat(chat.id, { isCurrent })
      if (!isCurrent() || useChatStore.getState().currentChatUuid !== chatUuid)
        return
      useChatStore.getState().toggleWebSearch(false)
      useChatStore.getState().setTasksPageOpen(false)
    } catch (error) {
      if (isCurrent())
        toast.error('Unable to open execution chat', {
          description: error instanceof Error ? error.message : String(error)
        })
    } finally {
      if (navigationRequest.current === request) setOpeningChat(false)
    }
  }
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const tasks = scheduledTasks.filter(isVisible).sort((a, b) => {
    const statusOrder = priority[a.status] - priority[b.status]
    if (statusOrder) return statusOrder
    return a.status === 'pending' ? a.run_at - b.run_at : b.run_at - a.run_at
  })
  const activeCount = tasks.filter(
    (task) => task.status === 'pending' || task.status === 'running'
  ).length
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: tasks.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'history', label: 'History', count: tasks.length - activeCount }
  ]
  const visibleTasks = tasks.filter(
    (task) =>
      filter === 'all' ||
      (filter === 'active') ===
        (task.status === 'pending' || task.status === 'running')
  )

  const handleAction = async (task: ScheduleTask): Promise<void> => {
    const cancel = task.status === 'pending' || task.status === 'running'
    setPendingIds((current) => new Set(current).add(task.id))
    try {
      const updated = await invokeDbScheduledTaskUpdateStatus({
        id: task.id,
        status: cancel ? 'cancelled' : 'dismissed',
        lastError: cancel ? 'Cancelled by user' : task.last_error
      })
      replaceTask(updated)
      setConfirmingId(null)
      toast.success(cancel ? 'Task cancelled' : 'Task dismissed', {
        description: task.goal
      })
    } catch (error) {
      toast.error(cancel ? 'Failed to cancel task' : 'Failed to dismiss task', {
        description: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        aria-label="Filter tasks"
        className="mb-4 flex shrink-0 items-center gap-1"
      >
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs transition-colors active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent)',
              filter === item.key
                ? 'border-(--app-border-standard) bg-(--app-surface-raised) font-semibold text-slate-800 dark:text-(--app-text-primary)'
                : 'border-transparent text-slate-500 hover:bg-(--app-surface-hover) dark:text-(--app-text-secondary)'
            )}
          >
            {item.label}
            <span className="text-[10px] tabular-nums text-slate-400 dark:text-(--app-text-muted)">
              {scheduleLoading || scheduleLoadError ? '—' : item.count}
            </span>
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="hidden shrink-0 grid-cols-[minmax(0,1fr)_140px_96px_128px] gap-4 overflow-hidden border-b border-(--app-border-subtle) px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-slate-400 [scrollbar-gutter:stable] sm:grid dark:text-(--app-text-muted)">
          <span>Task</span>
          <span>Scheduled for</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>
        {scheduleLoading ? (
          <p role="status" className="p-8 text-center text-xs text-slate-500">
            Loading schedules...
          </p>
        ) : scheduleLoadError ? (
          <p role="alert" className="p-8 text-center text-xs text-rose-500">
            {scheduleLoadError}
          </p>
        ) : visibleTasks.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500 dark:text-(--app-text-secondary)">
            {filter === 'all'
              ? 'No Tasks'
              : filter === 'active'
                ? 'No active tasks'
                : 'No task history'}
          </p>
        ) : (
          <div
            className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            aria-label="Task list"
          >
            {visibleTasks.map((task) => {
              const meta = STATUS[task.status]
              const cancel =
                task.status === 'pending' || task.status === 'running'
              const confirming = confirmingId === task.id && cancel
              const pending = pendingIds.has(task.id)
              return (
                <article
                  key={task.id}
                  className="border-b border-(--app-border-subtle) last:border-b-0"
                >
                  <div className="relative grid grid-cols-[minmax(0,1fr)_128px] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_96px_128px]">
                    <button
                      type="button"
                      aria-label={task.goal}
                      aria-expanded={expandedId === task.id}
                      aria-controls={`task-detail-${task.id}`}
                      onClick={() =>
                        setExpandedId(expandedId === task.id ? null : task.id)
                      }
                      className="absolute inset-0 cursor-pointer transition-colors duration-150 hover:bg-(--app-surface-hover) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--app-accent) motion-reduce:transition-none"
                    />
                    <div className="pointer-events-none relative min-w-0">
                      <h2 className="wrap-break-word text-[13px] font-medium leading-5 text-slate-700 dark:text-(--app-text-primary)">
                        <span className="flex w-full items-start gap-2 text-left">
                          <ChevronRight
                            className={cn(
                              'mt-1 size-3 shrink-0 text-slate-400',
                              expandedId === task.id && 'rotate-90'
                            )}
                          />
                          <span className="min-w-0 wrap-break-word">
                            {task.goal}
                          </span>
                        </span>
                      </h2>
                      <p className="mt-1 pl-5 wrap-break-word text-[11px] text-slate-400 dark:text-(--app-text-muted)">
                        {scheduleLabel(task)}
                      </p>
                      {task.status === 'failed' && task.last_error && (
                        <p
                          className="mt-1 line-clamp-2 wrap-break-word text-[11px] text-rose-500"
                          title={task.last_error}
                        >
                          {task.last_error}
                        </p>
                      )}
                    </div>
                    <time
                      dateTime={new Date(task.run_at).toISOString()}
                      title={new Date(task.run_at).toLocaleString('en-US', {
                        timeZoneName: 'short'
                      })}
                      className="pointer-events-none relative col-start-1 row-start-2 text-[11px] tabular-nums text-slate-500 sm:col-auto sm:row-auto dark:text-(--app-text-secondary)"
                    >
                      {taskTime(task.run_at, now)}
                    </time>
                    <span
                      className={cn(
                        'pointer-events-none relative col-start-1 row-start-3 inline-flex items-center gap-1.5 text-[11px] sm:col-auto sm:row-auto',
                        meta.color
                      )}
                    >
                      <meta.Icon
                        className={cn(
                          'size-3.5',
                          task.status === 'running' &&
                            'animate-spin motion-reduce:animate-none'
                        )}
                      />
                      {meta.label}
                    </span>
                    <div className="pointer-events-none relative col-start-2 row-start-1 flex flex-wrap justify-end gap-1 [&>button]:pointer-events-auto sm:col-auto sm:row-auto">
                      {confirming && (
                        <button
                          type="button"
                          disabled={pending}
                          aria-label="Keep task"
                          className={actionClass}
                          onClick={() => setConfirmingId(null)}
                        >
                          Keep
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={cancel ? 'Cancel task' : 'Dismiss task'}
                        className={cn(
                          actionClass,
                          cancel && 'text-rose-600 dark:text-rose-400'
                        )}
                        onClick={() => {
                          if (cancel && !confirming) setConfirmingId(task.id)
                          else void handleAction(task)
                        }}
                      >
                        {pending && (
                          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                        )}
                        {confirming
                          ? 'Confirm'
                          : cancel
                            ? 'Cancel'
                            : 'Remove'}
                      </button>
                    </div>
                  </div>
                  {expandedId === task.id && (
                    <div id={`task-detail-${task.id}`} className="px-4 pb-3">
                      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-lg bg-(--app-surface-hover) p-3 text-[11px] text-slate-500 dark:text-(--app-text-secondary)">
                        <dt>Instructions</dt>
                        <dd className="whitespace-pre-wrap wrap-break-word text-slate-700 dark:text-(--app-text-primary)">
                          {task.goal}
                        </dd>
                        <dt>Schedule</dt>
                        <dd className="wrap-break-word">
                          {scheduleLabel(task)}
                          {task.schedule_type === 'cron' &&
                            ` · ${task.timezone || 'Timezone not specified'}`}
                        </dd>
                        <dt>Scheduled for</dt>
                        <dd className="wrap-break-word">
                          {new Date(task.run_at).toLocaleString('en-US', {
                            timeZoneName: 'short'
                          })}
                        </dd>
                        <dt className="self-center">Execution chat</dt>
                        <dd>
                          {task.result_message_id != null ? <button
                            type="button"
                            disabled={openingChat}
                            className={cn(actionClass, '-ml-2')}
                            onClick={() => void openChat(task.result_message_id!)}
                          >
                            Open chat
                            <ArrowUpRight className="size-3" />
                          </button> : <span title="No execution result yet">--</span>}
                        </dd>
                      </dl>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
