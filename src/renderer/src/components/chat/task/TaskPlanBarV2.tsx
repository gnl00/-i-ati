import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { taskPlannerService } from '@renderer/services/taskPlanner/TaskPlannerService'
import type { Plan, PlanStep } from '@shared/task-planner/schemas'
import { CalendarClock, CheckCircle2, Circle, Loader2, PauseCircle, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'

type ScheduleTaskCardProps = {
  plan: Plan
  className?: string
  onPlanUpdated?: () => void
  onApprove?: () => void | Promise<void>
  onAbort?: (reason?: string) => void | Promise<void>
}

const statusLabelMap: Record<Plan['status'], string> = {
  pending: 'Pending',
  pending_review: 'Review',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

const statusToneMap: Record<Plan['status'], string> = {
  pending: 'border-amber-200/80 bg-amber-50/90 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
  pending_review: 'border-amber-200/80 bg-amber-50/90 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
  running: 'border-sky-200/80 bg-sky-50/90 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300',
  paused: 'border-slate-200/80 bg-slate-100/90 text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300',
  completed: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300',
  failed: 'border-rose-200/80 bg-rose-50/90 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300',
  cancelled: 'border-slate-200/80 bg-slate-100/90 text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300'
}

const statusIconMap: Record<Plan['status'], React.ReactNode> = {
  pending: <PauseCircle className="h-4 w-4" />,
  pending_review: <CalendarClock className="h-4 w-4" />,
  running: <Loader2 className="h-4 w-4 animate-spin" />,
  paused: <PauseCircle className="h-4 w-4" />,
  completed: <CheckCircle2 className="h-4 w-4" />,
  failed: <XCircle className="h-4 w-4" />,
  cancelled: <Circle className="h-4 w-4" />
}

const stepIconMap: Record<PlanStep['status'], React.ReactNode> = {
  todo: <Circle className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />,
  doing: <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500 dark:text-sky-400" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-rose-500" />,
  skipped: <Circle className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
}

const stepToneMap: Record<PlanStep['status'], string> = {
  todo: 'text-slate-500 dark:text-slate-400',
  doing: 'text-sky-700 dark:text-sky-300',
  done: 'text-emerald-700 dark:text-emerald-300',
  failed: 'text-rose-700 dark:text-rose-300',
  skipped: 'text-slate-400 dark:text-slate-500'
}

export function ScheduleTaskCard({
  plan,
  className,
  onPlanUpdated,
  onApprove,
  onAbort
}: ScheduleTaskCardProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const isPendingReview = plan.status === 'pending_review'
  const firstStepId = plan.steps[0]?.id

  const { completedCount, previewSteps, activeStep, failedStep } = useMemo(() => {
    const completed = plan.steps.filter(step => step.status === 'done').length
    const active = plan.steps.find(step => step.status === 'doing')
      ?? plan.steps.find(step => step.status === 'todo')
      ?? plan.steps.find(step => step.status === 'done')
      ?? plan.steps[0]
    const failed = plan.steps.find(step => step.status === 'failed')
    const preview = isPendingReview ? plan.steps : plan.steps.slice(0, 3)

    return {
      completedCount: completed,
      previewSteps: preview,
      activeStep: active,
      failedStep: failed
    }
  }, [isPendingReview, plan.steps])

  const summaryStep = failedStep ?? activeStep
  const progress = plan.steps.length > 0 ? Math.round((completedCount / plan.steps.length) * 100) : 0

  const handleStart = async () => {
    if (!isPendingReview || isUpdating) return
    if (onApprove) {
      try {
        setIsUpdating(true)
        await onApprove()
      } finally {
        setIsUpdating(false)
      }
      return
    }
    try {
      setIsUpdating(true)
      await taskPlannerService.updatePlanStatus(plan.id, 'running', firstStepId)
      onPlanUpdated?.()
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAbort = async () => {
    if (!isPendingReview || isUpdating) return
    if (onAbort) {
      try {
        setIsUpdating(true)
        await onAbort('user abort')
      } finally {
        setIsUpdating(false)
      }
      return
    }
    try {
      setIsUpdating(true)
      await taskPlannerService.updatePlanStatus(plan.id, 'cancelled', firstStepId, 'user abort')
      onPlanUpdated?.()
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-3xl border border-white/55 bg-white/72 shadow-[0_24px_80px_-46px_rgba(15,23,42,0.45)] backdrop-blur-xl',
        'dark:border-white/10 dark:bg-slate-950/50 dark:shadow-[0_28px_90px_-48px_rgba(2,6,23,0.82)]',
        className
      )}
    >
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                  statusToneMap[plan.status]
                )}
              >
                {statusIconMap[plan.status]}
                {statusLabelMap[plan.status]}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {completedCount}/{plan.steps.length} complete
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
                {plan.goal}
              </h3>
              {summaryStep && !isPendingReview && (
                <p className="flex items-center gap-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
                  <span className="shrink-0">{stepIconMap[summaryStep.status]}</span>
                  <span className="truncate">{summaryStep.title}</span>
                </p>
              )}
              {plan.failureReason && (
                <p className="text-[11px] leading-5 text-rose-600 dark:text-rose-300">
                  {plan.failureReason}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {progress}%
            </div>
            <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/90">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  plan.status === 'failed'
                    ? 'bg-rose-500'
                    : plan.status === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-sky-500'
                )}
                style={{ width: `${Math.max(progress, 8)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/50 bg-white/55 p-2 backdrop-blur-md dark:border-white/8 dark:bg-slate-900/45">
          <div className="space-y-1">
            {previewSteps.map((step, index) => (
              <div
                key={step.id}
                className="flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-white/45 dark:hover:bg-slate-950/35"
              >
                <div className="mt-0.5 shrink-0">{stepIconMap[step.status]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[11.5px] font-medium text-slate-700 dark:text-slate-200">
                      {index + 1}. {step.title}
                    </span>
                    <span className={cn('shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]', stepToneMap[step.status])}>
                      {step.status}
                    </span>
                  </div>
                  {step.error && (
                    <div className="mt-1 text-[10.5px] leading-5 text-rose-600 dark:text-rose-300">
                      {step.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isPendingReview && (
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={handleAbort}
              disabled={isUpdating}
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-200"
            >
              Reject
            </Button>
            <Button
              onClick={handleStart}
              disabled={isUpdating}
              size="sm"
              className="h-8 rounded-full px-3 text-[11px] font-semibold"
            >
              {isUpdating ? 'Updating...' : 'Accept'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
