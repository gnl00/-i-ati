import { v4 as uuidv4 } from 'uuid'
import { chatDb } from '@main/db/chat'
import { planningDb } from '@main/db/planning'
import { cronScheduleCalculator } from '@main/services/scheduler/CronScheduleCalculator'
import { schedulerService } from '@main/services/scheduler/SchedulerService'
import { ScheduleEventEmitter } from '@main/services/scheduler/event-emitter'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import type { ScheduledTaskRow, ScheduledTaskRunRow } from '@main/db/dao/ScheduledTaskDao'
import type {
  ScheduleCancelResponse,
  ScheduleCreateResponse,
  ScheduleListResponse,
  ScheduleUpdateResponse
} from '@shared/tools/schedule'

const MIN_DELAY_MS = 30_000
const ISO_DATETIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

const formatLocalISOString = (date = new Date()): string => {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}

type CreateArgs = {
  chat_uuid?: string; goal: string; run_at?: string; cron_expression?: string; timezone?: string
  plan_id?: string; payload?: Record<string, unknown>; max_attempts?: number
}
type UpdateArgs = {
  chat_uuid?: string; id: string; goal?: string; run_at?: string; cron_expression?: string
  timezone?: string; payload?: Record<string, unknown>; max_attempts?: number
}

function parseRunAt(runAt: string): number {
  if (!ISO_DATETIME_WITH_OFFSET.test(runAt)) {
    throw new Error('Invalid run_at format. Use an ISO-8601 datetime with a timezone offset.')
  }
  const timestamp = Date.parse(runAt)
  if (!Number.isFinite(timestamp)) {
    throw new Error('Invalid run_at format. Use an ISO-8601 datetime with a timezone offset.')
  }
  return Math.max(timestamp, Date.now() + MIN_DELAY_MS)
}

function normalizeMaxAttempts(value?: number): number {
  if (value === undefined) return 3
  if (!Number.isInteger(value) || value < 1) throw new Error('max_attempts must be an integer greater than or equal to 1')
  return value
}

function buildRun(taskId: string, scheduledFor: number, now = Date.now()): ScheduledTaskRunRow {
  return {
    id: uuidv4(), task_id: taskId, scheduled_for: scheduledFor, next_attempt_at: scheduledFor,
    status: 'pending', attempt_count: 0, submission_id: null, started_at: null, finished_at: null,
    last_error: null, result_message_id: null, created_at: now, updated_at: now
  }
}

function emitUpdated(taskId: string): void {
  const task = planningDb.getScheduledTaskById(taskId)
  if (!task) return
  const chat = chatDb.getChatByUuid(task.chat_uuid)
  new ScheduleEventEmitter({ chatId: chat?.id, chatUuid: task.chat_uuid }).emit(SCHEDULE_EVENTS.UPDATED, { task })
}

export async function processScheduleCreate(args: CreateArgs): Promise<ScheduleCreateResponse> {
  const currentDateTime = formatLocalISOString()
  try {
    if (!args.chat_uuid) return { success: false, message: 'chat_uuid is required', currentDateTime }
    const hasRunAt = typeof args.run_at === 'string'
    const hasCron = typeof args.cron_expression === 'string'
    if (hasRunAt === hasCron) return { success: false, message: 'Provide exactly one of run_at or cron_expression', currentDateTime }

    const scheduleType = hasCron ? 'cron' : 'once'
    let runAt: number
    if (scheduleType === 'cron') {
      if (!args.timezone) return { success: false, message: 'timezone is required for cron schedules', currentDateTime }
      cronScheduleCalculator.validate(args.cron_expression!, args.timezone)
      runAt = cronScheduleCalculator.next(args.cron_expression!, args.timezone, Date.now())
    } else {
      runAt = parseRunAt(args.run_at!)
    }

    const now = Date.now()
    const task: ScheduledTaskRow = {
      id: uuidv4(), chat_uuid: args.chat_uuid, plan_id: args.plan_id ?? null, goal: args.goal,
      schedule_type: scheduleType, cron_expression: args.cron_expression ?? null, run_at: runAt,
      timezone: scheduleType === 'cron' ? args.timezone! : null, status: 'pending',
      payload: args.payload ? JSON.stringify(args.payload) : null,
      max_attempts: normalizeMaxAttempts(args.max_attempts), last_run_at: null,
      last_run_status: null, run_count: 0, last_error: null, result_message_id: null,
      created_at: now, updated_at: now
    }
    planningDb.createScheduledTask(task, buildRun(task.id, runAt, now))
    emitUpdated(task.id)
    schedulerService.wake()
    return { success: true, task, currentDateTime }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), currentDateTime }
  }
}

export async function processScheduleList(args: { chat_uuid?: string }): Promise<ScheduleListResponse> {
  const currentDateTime = formatLocalISOString()
  if (!args.chat_uuid) return { success: false, message: 'chat_uuid is required', currentDateTime }
  return { success: true, tasks: planningDb.getScheduledTasksByChatUuid(args.chat_uuid), currentDateTime }
}

export async function processScheduleCancel(args: { chat_uuid?: string; id: string }): Promise<ScheduleCancelResponse> {
  const currentDateTime = formatLocalISOString()
  if (!args.chat_uuid) return { success: false, message: 'chat_uuid is required', currentDateTime }
  const task = planningDb.getScheduledTaskById(args.id)
  if (!task) return { success: false, message: `Scheduled task not found: ${args.id}`, currentDateTime }
  if (task.chat_uuid !== args.chat_uuid) return { success: false, message: 'Task does not belong to provided chat_uuid', currentDateTime }
  if (!['pending', 'running'].includes(task.status)) return { success: false, message: `Cannot cancel task in status: ${task.status}`, currentDateTime }
  schedulerService.cancelTask(task.id)
  return { success: true, id: task.id, currentDateTime }
}

export async function processScheduleUpdate(args: UpdateArgs): Promise<ScheduleUpdateResponse> {
  const currentDateTime = formatLocalISOString()
  try {
    if (!args.chat_uuid) return { success: false, message: 'chat_uuid is required', currentDateTime }
    const existing = planningDb.getScheduledTaskById(args.id)
    if (!existing) return { success: false, message: `Scheduled task not found: ${args.id}`, currentDateTime }
    if (existing.chat_uuid !== args.chat_uuid) return { success: false, message: 'Task does not belong to provided chat_uuid', currentDateTime }
    if (existing.status !== 'pending') return { success: false, message: `Only pending tasks can be updated. Current status: ${existing.status}`, currentDateTime }

    let runAt = existing.run_at
    let cronExpression = existing.cron_expression
    let timezone = existing.timezone
    if (existing.schedule_type === 'once') {
      if (args.cron_expression !== undefined || args.timezone !== undefined) throw new Error('once schedules accept run_at updates')
      if (args.run_at !== undefined) runAt = parseRunAt(args.run_at)
    } else {
      if (args.run_at !== undefined) throw new Error('cron schedules accept cron_expression and timezone updates')
      cronExpression = args.cron_expression ?? cronExpression
      timezone = args.timezone ?? timezone
      if (!cronExpression || !timezone) throw new Error('cron_expression and timezone are required for cron schedules')
      cronScheduleCalculator.validate(cronExpression, timezone)
      runAt = cronScheduleCalculator.next(cronExpression, timezone, Date.now())
    }

    const updated: ScheduledTaskRow = {
      ...existing, goal: args.goal ?? existing.goal, cron_expression: cronExpression,
      run_at: runAt, timezone, payload: args.payload ? JSON.stringify(args.payload) : existing.payload,
      max_attempts: args.max_attempts === undefined ? existing.max_attempts : normalizeMaxAttempts(args.max_attempts),
      last_error: null, updated_at: Date.now()
    }
    planningDb.updateScheduledTask(updated, buildRun(updated.id, runAt))
    emitUpdated(updated.id)
    schedulerService.wake()
    return { success: true, task: updated, currentDateTime }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), currentDateTime }
  }
}
