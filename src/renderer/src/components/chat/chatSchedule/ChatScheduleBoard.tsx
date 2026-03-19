import { cn } from '@renderer/lib/utils'
import { invokeDbScheduledTaskUpdateStatus } from '@renderer/invoker/ipcInvoker'
import type { ScheduleTask } from '@shared/tools/schedule'
import { AlertCircle, CalendarClock, Check, CheckCircle2, Clock3, Loader2, Square, X, XCircle } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

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

const TASK_STATUS_META: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pending',
    tone: 'text-amber-700 dark:text-amber-300',
    icon: <Clock3 className="h-3 w-3" />
  },
  running: {
    label: 'Running',
    tone: 'text-sky-700 dark:text-sky-300',
    icon: <Loader2 className="h-3 w-3 animate-spin" />
  },
  completed: {
    label: 'Completed',
    tone: 'text-emerald-700 dark:text-emerald-300',
    icon: <CheckCircle2 className="h-3 w-3" />
  },
  failed: {
    label: 'Failed',
    tone: 'text-rose-700 dark:text-rose-300',
    icon: <XCircle className="h-3 w-3" />
  },
  cancelled: {
    label: 'Cancelled',
    tone: 'text-slate-700 dark:text-slate-300',
    icon: <AlertCircle className="h-3 w-3" />
  }
}

interface ChatScheduleBoardProps {
  scheduledTasks: ScheduleTask[]
  scheduleLoading: boolean
  scheduleLoadError: string
}

type ExitPhase = 'sliding' | 'collapsing'

const TASK_PRIORITY: Record<string, number> = {
  running: 0,
  pending: 1,
  completed: 2,
  failed: 2,
  cancelled: 3,
  dismissed: 4
}

// Phase 1: 200ms slide-right + fade
const SLIDE_DURATION = 200
// Phase 2: 190ms height collapse (starts after slide)
const COLLAPSE_DURATION = 190
// Total exit duration
const EXIT_TOTAL = SLIDE_DURATION + COLLAPSE_DURATION

const getTaskActionMeta = (status: string) => {
  if (status === 'pending' || status === 'running') {
    return {
      label: 'Cancel task',
      Icon: Square
    }
  }

  return {
    label: 'Dismiss task',
    Icon: X
  }
}

const formatRunAt = (timestamp: number) => {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

const ChatScheduleBoard: React.FC<ChatScheduleBoardProps> = ({
  scheduledTasks,
  scheduleLoading,
  scheduleLoadError
}) => {
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set())
  const [confirmingTaskId, setConfirmingTaskId] = useState<string | null>(null)
  const [pendingActionTaskIds, setPendingActionTaskIds] = useState<Set<string>>(new Set())
  // exitPhases: tracks which phase each exiting item is in
  const [exitPhases, setExitPhases] = useState<Map<string, ExitPhase>>(new Map())
  // exitHeights: measured height of each item before collapse
  const [exitHeights, setExitHeights] = useState<Map<string, number>>(new Map())
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // tracks timer IDs for cleanup
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    // Clear all exit timers on tasks change
    exitTimers.current.forEach(id => clearTimeout(id))
    exitTimers.current.clear()
    setHiddenTaskIds(new Set())
    setConfirmingTaskId(null)
    setPendingActionTaskIds(new Set())
    setExitPhases(new Map())
    setExitHeights(new Map())
  }, [scheduledTasks])

  const boardTasks = useMemo(
    () => scheduledTasks.filter(task => task.status !== 'dismissed' && task.status !== 'cancelled'),
    [scheduledTasks]
  )

  const scheduleSummary = useMemo(() => {
    return boardTasks.reduce<Record<SummaryKey, number>>((acc, task) => {
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
  }, [boardTasks])

  const nextTask = useMemo(() => {
    return [...boardTasks]
      .filter(task => task.status === 'pending' || task.status === 'running')
      .sort((a, b) => a.run_at - b.run_at)[0]
  }, [boardTasks])

  const sortedTasks = useMemo(() => {
    return [...boardTasks].sort((a, b) => {
      const priorityDiff = (TASK_PRIORITY[a.status] ?? 2) - (TASK_PRIORITY[b.status] ?? 2)
      if (priorityDiff !== 0) return priorityDiff

      const runAtDiff = b.run_at - a.run_at
      if (runAtDiff !== 0) return runAtDiff

      const updatedAtDiff = b.updated_at - a.updated_at
      if (updatedAtDiff !== 0) return updatedAtDiff

      return b.created_at - a.created_at
    })
  }, [boardTasks])

  // visibleTasks includes items currently in exit animation (not yet fully dismissed)
  const visibleTasks = useMemo(
    () => sortedTasks.filter(task => !hiddenTaskIds.has(task.id)),
    [hiddenTaskIds, sortedTasks]
  )

  const shouldShowScrollFade = visibleTasks.length > 3

  const setItemRef = (taskId: string, node: HTMLDivElement | null) => {
    if (node) {
      itemRefs.current.set(taskId, node)
      return
    }
    itemRefs.current.delete(taskId)
  }

  const clearExitTimers = (taskId: string) => {
    const t1 = exitTimers.current.get(taskId)
    if (t1) {
      clearTimeout(t1)
      exitTimers.current.delete(taskId)
    }
    const t2 = exitTimers.current.get(`${taskId}_2`)
    if (t2) {
      clearTimeout(t2)
      exitTimers.current.delete(`${taskId}_2`)
    }
  }

  const restoreTask = (taskId: string) => {
    clearExitTimers(taskId)
    setHiddenTaskIds(prev => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
    setExitPhases(prev => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
    setExitHeights(prev => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
  }

  const hideTask = (taskId: string) => {
    const itemEl = itemRefs.current.get(taskId)

    if (itemEl) {
      const height = itemEl.offsetHeight

      // Store the measured height for collapse animation
      setExitHeights(prev => new Map(prev).set(taskId, height))

      // Phase 1: slide right + fade out
      setExitPhases(prev => new Map(prev).set(taskId, 'sliding'))

      // Phase 2: height collapse
      const t1 = setTimeout(() => {
        setExitPhases(prev => new Map(prev).set(taskId, 'collapsing'))
      }, SLIDE_DURATION + 10)

      // Phase complete: remove from DOM
      const t2 = setTimeout(() => {
        setHiddenTaskIds(prev => {
          const next = new Set(prev)
          next.add(taskId)
          return next
        })
        setExitPhases(prev => {
          const next = new Map(prev)
          next.delete(taskId)
          return next
        })
        setExitHeights(prev => {
          const next = new Map(prev)
          next.delete(taskId)
          return next
        })
        exitTimers.current.delete(taskId)
      }, EXIT_TOTAL + 20)

      exitTimers.current.set(taskId, t1)
      exitTimers.current.set(`${taskId}_2`, t2)
    } else {
      setHiddenTaskIds(prev => {
        const next = new Set(prev)
        next.add(taskId)
        return next
      })
    }

    setConfirmingTaskId(current => (current === taskId ? null : current))
  }

  const handleTaskAction = async (task: ScheduleTask) => {
    const nextStatus = task.status === 'pending' || task.status === 'running' ? 'cancelled' : 'dismissed'
    const nextLastError = nextStatus === 'cancelled' ? 'Cancelled by user' : task.last_error

    setPendingActionTaskIds(prev => new Set(prev).add(task.id))
    hideTask(task.id)

    try {
      await invokeDbScheduledTaskUpdateStatus({
        id: task.id,
        status: nextStatus,
        lastError: nextLastError
      })
      toast.success(nextStatus === 'cancelled' ? 'Task cancelled' : 'Task dismissed', {
        description: task.goal
      })
    } catch (error) {
      restoreTask(task.id)
      setConfirmingTaskId(task.status === 'pending' || task.status === 'running' ? task.id : null)
      toast.error(nextStatus === 'cancelled' ? 'Failed to cancel task' : 'Failed to dismiss task', {
        description: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setPendingActionTaskIds(prev => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  // Wrapper div: controls layout collapse (maxHeight + paddingBottom → 0)
  const getWrapperStyle = (taskId: string): React.CSSProperties => {
    const phase = exitPhases.get(taskId)
    const height = exitHeights.get(taskId) ?? 200

    if (phase === 'sliding') {
      // Hold layout space while the card slides out
      return {
        maxHeight: height + 8,
        paddingBottom: 8,
        overflow: 'hidden',
      }
    }

    if (phase === 'collapsing') {
      return {
        maxHeight: 0,
        paddingBottom: 0,
        overflow: 'hidden',
        transition: `max-height ${COLLAPSE_DURATION}ms cubic-bezier(0.4, 0, 1, 1), padding-bottom ${COLLAPSE_DURATION}ms ease`,
        willChange: 'max-height',
      }
    }

    // Normal state — use paddingBottom for inter-item spacing (replaces space-y-2)
    return { paddingBottom: 8 }
  }

  // Card div: controls visual exit (translateX + scale + opacity)
  const getCardStyle = (taskId: string): React.CSSProperties => {
    const phase = exitPhases.get(taskId)

    if (phase === 'sliding') {
      return {
        transform: 'translateX(18px) scale(0.975)',
        opacity: 0,
        transition: `transform ${SLIDE_DURATION}ms cubic-bezier(0.4, 0, 1, 1), opacity ${SLIDE_DURATION - 40}ms ease-out`,
        willChange: 'transform, opacity',
      }
    }

    if (phase === 'collapsing') {
      // Keep final state from slide (no transition needed — collapse handles visibility)
      return {
        transform: 'translateX(18px) scale(0.975)',
        opacity: 0,
      }
    }

    return {}
  }

  return (
    <>
      {/* Keyframes for internal animations */}
      <style>{`
        @keyframes _csb_confirm_in {
          from { opacity: 0; transform: scale(0.82) translateX(6px); }
          to   { opacity: 1; transform: scale(1)    translateX(0);   }
        }
        @keyframes _csb_empty_in {
          from { opacity: 0; transform: scale(0.96) translateY(5px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>

      <div className="overflow-hidden rounded-xl border border-white/55 bg-white/72 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/50 shadow-xs">
        <div className="space-y-1 p-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Task Board
              </p>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {nextTask ? nextTask.goal : '--'}
              </h3>
            </div>

            <div className="shrink-0 rounded-2xl border border-white/45 bg-white/55 px-3 py-2 text-right backdrop-blur-md dark:border-white/10 dark:bg-slate-900/45">
              <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" />
                Next run
              </div>
              <div className="mt-1 text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                {nextTask ? formatRunAt(nextTask.run_at) : '-- --'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/45 bg-black/1 px-3 py-2 backdrop-blur-md dark:border-white/8 dark:bg-slate-900/45">
            {(Object.keys(SUMMARY_META) as SummaryKey[]).map(key => {
              const meta = SUMMARY_META[key]
              return (
                <div
                  key={key}
                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClassName)} />
                  <span className={cn('font-semibold leading-none tracking-tight', meta.valueClassName)}>
                    {scheduleSummary[key]}
                  </span>
                  <span className="leading-none text-slate-500 dark:text-slate-400">{meta.label}</span>
                </div>
              )
            })}
          </div>

          {scheduleLoading ? (
            <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-slate-300/80 text-sm text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
              Loading schedules...
            </div>
          ) : scheduleLoadError ? (
            <div className="flex h-28 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/60 text-sm text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
              {scheduleLoadError}
            </div>
          ) : visibleTasks.length === 0 ? (
            <div
              className="h-auto py-1.5 flex items-center justify-center rounded-xl border border-dashed border-slate-300/80 text-sm text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
              style={{ animation: '_csb_empty_in 300ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
            >
              No scheduled tasks
            </div>
          ) : (
            <div className="relative">
              {/* No space-y-2 — spacing managed via wrapper paddingBottom */}
              <div className="relative max-h-50 overflow-y-auto pr-1">
              {visibleTasks.map((task) => {
                const meta = TASK_STATUS_META[task.status] ?? TASK_STATUS_META.pending
                const actionMeta = getTaskActionMeta(task.status)
                const requiresConfirm = task.status === 'pending' || task.status === 'running'
                const isConfirming = confirmingTaskId === task.id
                const isPendingAction = pendingActionTaskIds.has(task.id)
                return (
                    // Wrapper: owns layout space and collapses it
                    <div key={task.id} style={getWrapperStyle(task.id)}>
                      {/* Card: owns visual transform/opacity */}
                      <div
                        ref={(node) => setItemRef(task.id, node)}
                        className="group rounded-2xl border border-white/45 bg-white/48 px-3 py-1.5 dark:border-white/8 dark:bg-slate-900/42"
                        style={getCardStyle(task.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                              <span className={cn('inline-flex items-center gap-1 font-medium', meta.tone)}>
                                {meta.icon}
                                {meta.label}
                              </span>
                              <span className="text-slate-300 dark:text-slate-700">·</span>
                              <span>{formatRunAt(task.run_at)}</span>
                            </div>
                            <p className="text-[12px] font-medium leading-[1.15rem] text-slate-600 dark:text-slate-100">
                              {task.goal}
                            </p>
                            {task.last_error && (
                              <p className="truncate text-[10px] leading-4 text-rose-600 dark:text-rose-300">
                                {task.last_error}
                              </p>
                            )}
                          </div>

                          {requiresConfirm && isConfirming ? (
                            <div
                              className="mt-0.5 inline-flex shrink-0 items-center gap-1"
                              style={{ animation: '_csb_confirm_in 170ms cubic-bezier(0.34, 1.4, 0.64, 1) both' }}
                            >
                            <button
                              type="button"
                              onClick={() => setConfirmingTaskId(null)}
                              disabled={isPendingAction}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-black/5 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:text-slate-500 dark:hover:bg-white/6 dark:hover:text-slate-200 dark:focus-visible:ring-slate-700"
                              aria-label="Keep task"
                              title="Keep task"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            <button
                              type="button"
                              onClick={() => void handleTaskAction(task)}
                              disabled={isPendingAction}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-rose-500 transition-all hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:pointer-events-none disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-500/12 dark:hover:text-rose-300 dark:focus-visible:ring-rose-900"
                              aria-label={actionMeta.label}
                              title={actionMeta.label}
                            >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (isPendingAction) return
                              if (requiresConfirm) {
                                setConfirmingTaskId(task.id)
                                return
                              }
                              void handleTaskAction(task)
                            }}
                            disabled={isPendingAction}
                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-all hover:bg-black/5 hover:text-slate-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:pointer-events-none disabled:opacity-50 group-hover:opacity-100 dark:text-slate-500 dark:hover:bg-white/6 dark:hover:text-slate-200 dark:focus-visible:ring-slate-700"
                            aria-label={actionMeta.label}
                            title={actionMeta.label}
                          >
                              <actionMeta.Icon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {shouldShowScrollFade && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-xl bg-gradient-to-b from-transparent via-white/55 to-white/92 dark:via-slate-950/55 dark:to-slate-950/92" />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default ChatScheduleBoard
