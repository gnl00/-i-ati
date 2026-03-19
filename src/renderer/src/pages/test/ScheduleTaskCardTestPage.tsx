import { ScheduleTaskCard } from '@renderer/components/chat/task/ScheduleTaskCard'
import ChatScheduleBoardV5 from '@renderer/components/chat/chatSchedule/ChatScheduleBoard'
import type { Plan } from '@shared/task-planner/schemas'
import type { ScheduleTask } from '@shared/tools/schedule'

const mockPlans: Plan[] = [
  {
    id: 'schedule-card-pending-review',
    goal: 'Refactor plugin sync so renderer store stays consistent after tool-driven install and uninstall.',
    status: 'pending_review',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      { id: 'step-1', title: 'Read current plugin store and event wiring', status: 'done' },
      { id: 'step-2', title: 'Design a main-to-renderer plugin event channel', status: 'doing' },
      { id: 'step-3', title: 'Hook the renderer store to plugin updates', status: 'todo' },
      { id: 'step-4', title: 'Broadcast plugin changes after tool-driven uninstall', status: 'todo' },
      { id: 'step-5', title: 'Verify Settings plugins list refreshes without manual reload', status: 'todo' }
    ]
  },
  {
    id: 'schedule-card-running',
    goal: 'Reduce noisy tool confirmation cards and improve compact message layout for command execution.',
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      { id: 'step-1', title: 'Audit current confirmation layout', status: 'done' },
      { id: 'step-2', title: 'Tighten spacing and weight hierarchy', status: 'doing' },
      { id: 'step-3', title: 'Test copy interaction density', status: 'todo' }
    ]
  },
  {
    id: 'schedule-card-failed',
    goal: 'Ship a minimal MCP install tool without a dedicated lifecycle manager.',
    status: 'failed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    failureReason: 'MCP install still mixes config persistence and runtime connection, so the boundary is not stable enough.',
    steps: [
      { id: 'step-1', title: 'Reuse current McpRuntimeService directly', status: 'done' },
      { id: 'step-2', title: 'Validate save + connect behavior', status: 'failed', error: 'Connection and persistence paths are still coupled.' },
      { id: 'step-3', title: 'Extract a small manager service first', status: 'skipped' }
    ]
  }
]

const now = Date.now()

const mockScheduledTasks: ScheduleTask[] = [
  {
    id: 'schedule-1',
    chat_uuid: 'chat-1',
    plan_id: 'plan-pending-review',
    goal: 'Retry plugin sync verification after renderer store refresh completes.',
    run_at: now + 1000 * 60 * 45,
    timezone: 'Asia/Shanghai',
    status: 'pending',
    payload: null,
    attempt_count: 0,
    max_attempts: 3,
    last_error: null,
    result_message_id: null,
    created_at: now - 1000 * 60 * 20,
    updated_at: now - 1000 * 60 * 20
  },
  {
    id: 'schedule-2',
    chat_uuid: 'chat-1',
    plan_id: null,
    goal: 'Run MCP install boundary check and capture runtime logs.',
    run_at: now + 1000 * 60 * 5,
    timezone: 'Asia/Shanghai',
    status: 'running',
    payload: null,
    attempt_count: 1,
    max_attempts: 2,
    last_error: null,
    result_message_id: null,
    created_at: now - 1000 * 60 * 50,
    updated_at: now - 1000 * 60 * 2
  },
  {
    id: 'schedule-3',
    chat_uuid: 'chat-2',
    plan_id: null,
    goal: 'Summarize the latest plugin uninstall regression and write follow-up steps.',
    run_at: now - 1000 * 60 * 60,
    timezone: 'Asia/Shanghai',
    status: 'completed',
    payload: null,
    attempt_count: 1,
    max_attempts: 1,
    last_error: null,
    result_message_id: 128,
    created_at: now - 1000 * 60 * 80,
    updated_at: now - 1000 * 60 * 55
  },
  {
    id: 'schedule-4',
    chat_uuid: 'chat-3',
    plan_id: null,
    goal: 'Retry remote MCP connection after invalid credentials are updated.',
    run_at: now - 1000 * 60 * 90,
    timezone: 'Asia/Shanghai',
    status: 'failed',
    payload: null,
    attempt_count: 2,
    max_attempts: 2,
    last_error: 'Connection refused by remote MCP server.',
    result_message_id: null,
    created_at: now - 1000 * 60 * 120,
    updated_at: now - 1000 * 60 * 88
  }
]

export default function ScheduleTaskCardTestPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-stone-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute inset-0">
        <div className="absolute left-10 top-8 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl dark:bg-orange-400/8" />
        <div className="absolute right-12 top-24 h-80 w-80 rounded-full bg-sky-200/45 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute bottom-10 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-500/8" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Schedule Task Card Playground
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Explore a card layout direction without touching `TaskPlanBar`.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            This page is a separate test surface for `ScheduleTaskCard`. Use it to try a more card-like task layout before deciding whether to replace the current plan bar.
          </p>
        </div>

        <ChatScheduleBoardV5
          scheduledTasks={mockScheduledTasks}
          scheduleLoading={false}
          scheduleLoadError=""
        />

        <div className="grid gap-4 md:grid-cols-2">
          {mockPlans.map((plan) => (
            <ScheduleTaskCard key={plan.id} plan={plan} />
          ))}
        </div>
      </div>
    </div>
  )
}
