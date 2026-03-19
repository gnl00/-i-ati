import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Plan, PlanStep } from '@shared/task-planner/schemas'
import { cn } from '@renderer/lib/utils'
import { taskPlannerService } from '@renderer/services/taskPlanner/TaskPlannerService'
import { Button } from '@renderer/components/ui/button'

type TaskPlanBarProps = {
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

export function TaskPlanBar({
  plan,
  className,
  onPlanUpdated,
  onApprove,
  onAbort
}: TaskPlanBarProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const isPendingReview = plan.status === 'pending_review'
  const firstStepId = plan.steps[0]?.id

  const { completedCount, activeStep, failedStep, progressPercent } = useMemo(() => {
    const completed = plan.steps.filter(step => step.status === 'done').length
    const total = plan.steps.length
    return {
      completedCount: completed,
      activeStep: plan.steps.find(step => step.status === 'doing')
        ?? plan.steps.find(step => step.status === 'todo')
        ?? plan.steps.find(step => step.status === 'done')
        ?? plan.steps[0],
      failedStep: plan.steps.find(step => step.status === 'failed'),
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0
    }
  }, [plan.steps])

  const summaryText = failedStep
    ? failedStep.title
    : activeStep?.title || plan.goal

  const summaryStep = failedStep ?? activeStep
  const shouldShowDetails = isPendingReview || expanded

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
    <motion.div
      layout
      transition={{ layout: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }}
      className={cn(
        'overflow-hidden rounded-2xl border border-white/55 bg-white/52 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl',
        'dark:border-white/10 dark:bg-slate-950/38 dark:shadow-[0_24px_70px_-42px_rgba(2,6,23,0.8)]',
        className
      )}
    >
      {isPendingReview ? (
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                    statusToneMap[plan.status]
                  )}
                >
                  {statusLabelMap[plan.status]}
                </span>
                <span className="text-[10.5px] text-slate-600 dark:text-slate-300">
                  {completedCount}/{plan.steps.length} complete
                </span>
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  {plan.steps.length} planned
                </span>
              </div>

              <p className="line-clamp-1 text-[12px] font-medium leading-5 text-slate-800 dark:text-slate-100">
                {plan.goal}
              </p>

              <div className="flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/80">
                  <div
                    className="h-full rounded-full bg-amber-500/80 transition-[width] duration-300 dark:bg-amber-400/80"
                    style={{ width: `${Math.max(progressPercent, 8)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10.5px] font-medium text-slate-600 dark:text-slate-300">
                  {progressPercent}%
                </span>
              </div>
            </div>

            <div className="shrink-0">
              <div className="flex items-center gap-1 rounded-full border border-white/50 bg-white/46 p-1 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.38)] backdrop-blur-md dark:border-white/10 dark:bg-slate-900/46">
                <Button
                  onClick={handleAbort}
                  disabled={isUpdating}
                  variant="ghost"
                  size="xs"
                  className={cn(
                    'h-6 rounded-full px-2.5 text-[10px] font-semibold shadow-none',
                    'text-rose-600 hover:bg-rose-50/75 hover:text-rose-700',
                    'dark:text-rose-300 dark:hover:bg-rose-950/35 dark:hover:text-rose-200',
                    'disabled:opacity-50'
                  )}
                >
                  Reject
                </Button>
                <Button
                  onClick={handleStart}
                  disabled={isUpdating}
                  size="xs"
                  className={cn(
                    'h-6 rounded-full px-2.5 text-[10px] font-semibold shadow-none',
                    'bg-slate-900 text-white hover:bg-slate-800',
                    'dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                  )}
                >
                  {isUpdating ? 'Updating...' : 'Accept'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
              statusToneMap[plan.status]
            )}
          >
            {statusLabelMap[plan.status]}
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">
              {summaryStep && (
                <span className="shrink-0">{stepIconMap[summaryStep.status]}</span>
              )}
              <span className="truncate">{summaryText}</span>
            </p>

            <div className="flex items-center gap-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/75 dark:bg-slate-800/80">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300',
                    plan.status === 'failed'
                      ? 'bg-rose-500'
                      : plan.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-sky-500'
                  )}
                  style={{ width: `${Math.max(progressPercent, 8)}%` }}
                />
              </div>
              <span className="shrink-0 text-[10.5px] text-slate-600 dark:text-slate-300">
                {completedCount}/{plan.steps.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            aria-label={expanded ? 'Hide details' : 'Show details'}
            className="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            />
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {shouldShowDetails && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.18, ease: 'easeOut' }
            }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -8, filter: 'blur(6px)' }}
              animate={{ y: 0, filter: 'blur(0px)' }}
              exit={{ y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="border-t border-white/30 bg-white/14 px-4 py-2 backdrop-blur-sm dark:border-white/8 dark:bg-slate-950/18"
            >
              {!isPendingReview && (
                <div className="mb-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{plan.goal}</span>
                  {plan.failureReason && (
                    <span className="ml-2 text-rose-600 dark:text-rose-300">{plan.failureReason}</span>
                  )}
                </div>
              )}

              <div className="space-y-1">
                {plan.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-white/28 dark:hover:bg-slate-950/24"
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
