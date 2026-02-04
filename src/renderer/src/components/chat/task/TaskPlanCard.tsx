import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { Plan, PlanStep } from '@shared/task-planner/schemas'
import { cn } from '@renderer/lib/utils'
import { taskPlannerService } from '@renderer/services/taskPlanner/TaskPlannerService'
import { Button } from '@renderer/components/ui/button'

type TaskPlanCardProps = {
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

const stepIconMap: Record<PlanStep['status'], React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-slate-400 dark:text-slate-500" />,
  doing: <Loader2 className="h-4 w-4 animate-spin text-sky-500 dark:text-sky-400" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-rose-500" />,
  skipped: <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
}

const statusToneMap: Record<Plan['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  pending_review: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  running: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  paused: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  cancelled: 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
}

export function TaskPlanCard({ plan, className, onPlanUpdated, onApprove, onAbort }: TaskPlanCardProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const isPendingReview = plan.status === 'pending_review'
  const firstStepId = plan.steps[0]?.id

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
        'rounded-xl border border-slate-200/70 bg-slate-50/80 shadow-xs',
        'dark:border-slate-800/80 dark:bg-slate-950/60',
        'px-4 py-3',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 select-none">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{plan.goal}</h3>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight',
            statusToneMap[plan.status]
          )}
        >
          {statusLabelMap[plan.status]}
        </span>
      </div>

      <div className="space-y-2 pb-1">
        {plan.steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
            {stepIconMap[step.status]}
            <span className={cn(step.status === 'failed' && 'text-rose-500 dark:text-rose-400')}>
              {step.title}
            </span>
          </div>
        ))}
      </div>

      {plan.failureReason && (
        <div className="mt-3 rounded-lg border border-rose-200/60 bg-rose-50/70 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {plan.failureReason}
        </div>
      )}

      {isPendingReview && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2.5">
          <Button
            variant={'ghost'}
            onClick={handleStart}
            size='xs'
            className='text-slate-600 hover:text-slate-900 rounded-xl transition-all duration-100'
          >
            Accept
          </Button>
          <Button
            variant={'ghost'}
            size='xs'
            onClick={handleAbort}
            className='text-red-300 hover:text-red-500 rounded-xl transition-all duration-100'
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
