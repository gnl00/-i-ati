import { useEffect, useRef, useState } from 'react'
import './tasks-page.css'
import {
  ArrowUpRight,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Loader2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import {
  invokeDbMessageGetById,
  invokeDbScheduledTaskUpdateStatus
} from '@renderer/infrastructure/ipc'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/shared/components/ui/tooltip'
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
  skipped: {
    label: 'Skipped',
    Icon: Clock3,
    color: 'text-slate-400 dark:text-(--app-text-muted)'
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
  completed: 3,
  skipped: 3
}
const isVisible = (
  task: ScheduleTask
): task is ScheduleTask & { status: VisibleStatus } => task.status in STATUS
const actionClass =
  'inline-flex h-7 shrink-0 gap-1 px-2 text-[11px] whitespace-nowrap items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-(--app-surface-hover) active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent) disabled:opacity-50 dark:text-(--app-text-secondary)'

export default function ChatScheduleBoard(): React.ReactElement {
  const { scheduledTasks, scheduleLoading, scheduleLoadError, replaceTask } =
    useScheduledTasks()
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
      if (!chatUuid)
        throw new Error('The execution chat is no longer available')
      if (useChatStore.getState().currentChatUuid === chatUuid) {
        useChatStore.getState().setTasksPageOpen(false)
        return
      }
      const chat = (await getAllChat()).find((item) => item.uuid === chatUuid)
      if (!isCurrent()) return
      if (!chat?.id)
        throw new Error('The execution chat is no longer available')
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

  const selectedTask =
    visibleTasks.find((task) => task.id === selectedId) ?? visibleTasks[0]

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

  const renderDetails = (
    task: ScheduleTask & { status: VisibleStatus }
  ): React.ReactElement => {
    const meta = STATUS[task.status]
    const skipped = task.status === 'skipped' || task.last_run_status === 'skipped'
    const cancel = task.status === 'pending' || task.status === 'running'
    const confirming = confirmingId === task.id && cancel
    const pending = pendingIds.has(task.id)
    return (
      <aside
        aria-label="Task details"
        id="selected-task-details"
        className="tasks-detail min-h-0 overflow-y-auto overscroll-contain"
      >
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-(--app-text-muted)">
          Task details
        </p>
        <h3 className="mb-5 wrap-break-word text-[14px] font-medium leading-6 text-slate-700 dark:text-(--app-text-primary)">
          {task.goal}
        </h3>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-3 text-[11px] text-slate-500 dark:text-(--app-text-secondary)">
          <dt>State</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className={cn('flex shrink-0 items-center gap-1.5', meta.color)}>
              <meta.Icon
                className={cn(
                  'size-3.5 shrink-0',
                  task.status === 'running' &&
                    'animate-spin motion-reduce:animate-none'
                )}
              />
              {meta.label}
            </span>
            {task.last_error && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${skipped ? 'Skipped run' : 'Execution error'}: ${task.last_error}`}
                      className={cn(
                        'inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent)',
                        skipped
                          ? 'text-slate-500 bg-(--app-surface-inset) dark:text-(--app-text-secondary)'
                          : 'text-rose-600 bg-rose-50 dark:bg-rose-400/10 dark:text-rose-400'
                      )}
                    >
                      <span className="truncate">
                        {task.status === 'failed' || task.status === 'skipped'
                          ? task.last_error
                          : skipped ? 'Last run skipped' : 'Last run failed'}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72 whitespace-pre-wrap wrap-break-word rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-primary) dark:backdrop-blur-none">
                    {task.last_error}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </dd>
          <dt>{cancel ? 'Next run' : 'Scheduled for'}</dt>
          <dd>
            <time
              dateTime={new Date(task.run_at).toISOString()}
              title={new Date(task.run_at).toLocaleString('en-US', {
                timeZoneName: 'short'
              })}
            >
              {taskTime(task.run_at, now)}
            </time>
          </dd>
          <dt>Schedule</dt>
          <dd className="wrap-break-word">{scheduleLabel(task)}</dd>
          {task.timezone && (
            <>
              <dt>Timezone</dt>
              <dd className="wrap-break-word">{task.timezone}</dd>
            </>
          )}
          <dt>Execution chat</dt>
          <dd>
            {task.result_message_id != null ? (
              <button
                type="button"
                disabled={openingChat}
                className="inline-flex items-center gap-1 rounded-sm text-[11px] leading-[inherit] transition-colors hover:text-slate-700 hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent) disabled:opacity-50 dark:hover:text-(--app-text-primary)"
                onClick={() => void openChat(task.result_message_id!)}
              >
                Open chat
                <ArrowUpRight className="size-3" />
              </button>
            ) : (
              <span>No execution result yet</span>
            )}
          </dd>
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-2">
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
              'border border-(--app-border-standard)',
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
            {confirming ? 'Confirm' : cancel ? 'Cancel task' : 'Remove'}
          </button>
        </div>
      </aside>
    )
  }

  return (
    <section
      aria-label="Scheduled tasks"
      className="tasks-board flex min-h-0 flex-1 flex-col"
    >
      <div className="mb-3 flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-medium">
          Tasks
          <span className="text-[11px] font-normal tabular-nums text-slate-400 dark:text-(--app-text-muted)">
            {scheduleLoading || scheduleLoadError ? '—' : tasks.length}
          </span>
        </h2>
        <div aria-label="Filter tasks" className="flex items-center gap-1">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              onClick={() => {
                setFilter(item.key)
                setConfirmingId(null)
              }}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--app-accent)',
                filter === item.key
                  ? 'border-(--app-border-standard) bg-(--app-surface-raised) font-medium text-slate-800 dark:text-(--app-text-primary)'
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
      </div>
      {scheduleLoading ? (
        <p role="status" className="p-8 text-center text-xs text-slate-500">
          Loading schedules...
        </p>
      ) : scheduleLoadError ? (
        <p role="alert" className="p-8 text-center text-xs text-rose-500">
          {scheduleLoadError}
        </p>
      ) : !selectedTask ? (
        <p className="p-8 text-center text-xs text-slate-500 dark:text-(--app-text-secondary)">
          {filter === 'all'
            ? 'No Tasks'
            : filter === 'active'
              ? 'No active tasks'
              : 'No task history'}
        </p>
      ) : (
        <div className="tasks-master-detail min-h-0 flex-1">
          <div
            aria-label="Task list"
            className="tasks-list min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
          >
            {visibleTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                aria-label={task.status === 'completed' || task.status === 'skipped' ? `${task.goal} (${STATUS[task.status].label})` : task.goal}
                aria-pressed={selectedTask.id === task.id}
                aria-controls="selected-task-details"
                onClick={() => {
                  setSelectedId(task.id)
                  setConfirmingId(null)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border-b border-(--app-border-subtle) px-3 py-2 text-left last:border-b-0 hover:bg-(--app-surface-hover) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--app-accent)',
                  selectedTask.id === task.id && 'bg-(--app-surface-hover)'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block wrap-break-word text-[13px] leading-5',
                      task.status === 'completed' || task.status === 'skipped'
                        ? 'font-normal text-slate-500 dark:text-(--app-text-secondary)'
                        : 'font-medium'
                    )}
                  >
                    {task.goal}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-slate-400 dark:text-(--app-text-muted)">
                    <span className="wrap-break-word">{scheduleLabel(task)}</span>
                    <time
                      dateTime={new Date(task.run_at).toISOString()}
                      className={cn(
                        'rounded px-1.5 py-0.5 font-medium tabular-nums',
                        task.status === 'completed' || task.status === 'skipped'
                          ? 'bg-(--app-surface-inset)/40 text-slate-400 dark:text-(--app-text-muted)'
                          : 'bg-(--app-surface-inset) text-slate-500 dark:text-(--app-text-secondary)'
                      )}
                    >
                      {taskTime(task.run_at, now)}
                    </time>
                  </span>
                  {(task.status === 'running' || task.status === 'failed') && (
                    <span
                      className={cn(
                        'mt-1 flex items-center gap-1.5 text-[11px]',
                        STATUS[task.status].color
                      )}
                    >
                      {task.status === 'running' ? (
                        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <XCircle className="size-3" />
                      )}
                      {STATUS[task.status].label}
                    </span>
                  )}
                </span>
                {task.status === 'completed' || task.status === 'skipped' ? (
                  <>
                    <span className="sr-only">{STATUS[task.status].label}</span>
                    {task.status === 'skipped' ? (
                      <Clock3
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-slate-400 dark:text-(--app-text-muted)"
                      />
                    ) : (
                      <CheckCircle2
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-slate-400 dark:text-(--app-text-muted)"
                      />
                    )}
                  </>
                ) : (
                  <ChevronRight className="size-3 shrink-0 text-slate-400 dark:text-(--app-text-muted)" />
                )}
              </button>
            ))}
          </div>
          {renderDetails(selectedTask)}
        </div>
      )}
    </section>
  )
}
