import { TaskPlanBar } from '@renderer/components/chat/task/TaskPlanBar'
import type { Plan } from '@shared/task-planner/schemas'

const mockPlans: Plan[] = [
  {
    id: 'plan-pending-review',
    goal: 'Refactor plugin sync so renderer store stays consistent after tool-driven install and uninstall.',
    status: 'pending_review',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      { id: 'step-1', title: 'Read current plugin store and event wiring', status: 'done' },
      { id: 'step-2', title: 'Design a main-to-renderer plugin event channel', status: 'doing' },
      { id: 'step-3', title: 'Hook the renderer store to plugin updates', status: 'todo' },
      { id: 'step-4', title: 'Broadcast plugin changes after tool-driven uninstall', status: 'todo' },
      { id: 'step-5', title: 'Verify Settings plugins list refreshes without manual reload', status: 'todo' },
      { id: 'step-6', title: 'Write regression tests for install and uninstall synchronization', status: 'todo' }
    ]
  },
  {
    id: 'plan-running',
    goal: 'Improve TaskPlanCard visual hierarchy for long goals and mixed step states.',
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      { id: 'step-1', title: 'Adjust goal, badge, and spacing rhythm', status: 'doing' },
      { id: 'step-2', title: 'Reduce visual noise in completed steps', status: 'todo' },
      { id: 'step-3', title: 'Tighten action footer and response states', status: 'todo' }
    ]
  },
  {
    id: 'plan-failed',
    goal: 'Ship a minimal MCP install tool without a dedicated lifecycle manager.',
    status: 'failed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    failureReason: 'MCP install still mixes config persistence and runtime connection, so the boundary is not stable enough.',
    steps: [
      { id: 'step-1', title: 'Reuse current McpRuntimeService directly', status: 'done' },
      { id: 'step-2', title: 'Validate save + connect behavior', status: 'failed' },
      { id: 'step-3', title: 'Extract a small manager service first', status: 'skipped' }
    ]
  }
]

export default function TaskPlanCardTestPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute inset-0">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/12" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-amber-200/45 blur-3xl dark:bg-amber-400/10" />
        <div className="absolute bottom-16 left-1/3 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-400/10" />
        <div
          className="absolute inset-0 opacity-[0.45] dark:opacity-[0.22]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)',
            backgroundSize: '28px 28px'
          }}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Task Plan Bar Playground
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inspect `TaskPlanBar` states without entering a live chat flow.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            This page is a temporary renderer-only test surface. Tune density, status weight, and sticky-top fit here first, then swap `App.tsx` back to `HomeV2`.
          </p>
        </div>

        <div className="space-y-3">
          {mockPlans.map((plan) => (
            <TaskPlanBar key={plan.id} plan={plan} />
          ))}
        </div>
      </div>
    </div>
  )
}
