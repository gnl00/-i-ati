import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/services/DatabaseService'
import { ScheduleEventEmitter } from '@main/services/scheduler/event-emitter'

const MIN_DELAY_MS = 30_000

const formatLocalISOString = (date: Date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const offsetHours = pad(Math.floor(absMinutes / 60))
  const offsetMins = pad(absMinutes % 60)
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMins}`
}

type ScheduleCreateArgs = {
  chat_uuid?: string
  goal: string
  run_at: string
  timezone?: string
  plan_id?: string
  payload?: Record<string, unknown>
  max_attempts?: number
}

type ScheduleListArgs = {
  chat_uuid?: string
}

type ScheduleCancelArgs = {
  chat_uuid?: string
  id: string
}

type ScheduleUpdateArgs = {
  chat_uuid?: string
  id: string
  goal?: string
  run_at?: string
  timezone?: string
  payload?: Record<string, unknown>
  max_attempts?: number
}

function parseRunAt(runAt: string): number | null {
  if (!runAt || typeof runAt !== 'string') return null
  const ts = Date.parse(runAt)
  if (!Number.isFinite(ts)) return null
  return ts
}

function ensureMinDelay(runAtMs: number): { ok: true } | { ok: false; message: string } {
  const minRunAt = Date.now() + MIN_DELAY_MS
  if (runAtMs < minRunAt) {
    return { ok: false, message: `run_at must be at least ${Math.floor(MIN_DELAY_MS / 1000)} seconds in the future` }
  }
  return { ok: true }
}

function emitScheduleUpdated(taskId: string): void {
  const task = DatabaseService.getScheduledTaskById(taskId)
  if (!task) return
  const chat = DatabaseService.getChatByUuid(task.chat_uuid)
  const emitter = new ScheduleEventEmitter({
    chatId: chat?.id,
    chatUuid: task.chat_uuid
  })
  emitter.emit('schedule.updated', { task })
}

export async function processScheduleCreate(args: ScheduleCreateArgs) {
  try {
    const currentDateTime = formatLocalISOString()
    if (!args.chat_uuid) {
      return { success: false, message: 'chat_uuid is required', currentDateTime }
    }
    const runAtMs = parseRunAt(args.run_at)
    if (runAtMs === null) {
      return { success: false, message: 'Invalid run_at format. Use ISO-8601 datetime string.', currentDateTime }
    }
    const minDelayCheck = ensureMinDelay(runAtMs)
    if (!minDelayCheck.ok) {
      return { success: false, message: minDelayCheck.message, currentDateTime }
    }

    const now = Date.now()
    const task = {
      id: uuidv4(),
      chat_uuid: args.chat_uuid,
      plan_id: args.plan_id ?? null,
      goal: args.goal,
      run_at: runAtMs,
      timezone: args.timezone ?? null,
      status: 'pending',
      payload: args.payload ? JSON.stringify(args.payload) : null,
      attempt_count: 0,
      max_attempts: args.max_attempts ?? 0,
      last_error: null,
      result_message_id: null,
      created_at: now,
      updated_at: now
    }

    DatabaseService.saveScheduledTask(task)
    emitScheduleUpdated(task.id)
    return { success: true, task, currentDateTime }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[ScheduleTools] Failed to create schedule:', error)
    return { success: false, message, currentDateTime: formatLocalISOString() }
  }
}

export async function processScheduleList(args: ScheduleListArgs) {
  try {
    const currentDateTime = formatLocalISOString()
    if (!args.chat_uuid) {
      return { success: false, message: 'chat_uuid is required', currentDateTime }
    }
    const tasks = DatabaseService.getScheduledTasksByChatUuid(args.chat_uuid)
    return { success: true, tasks, currentDateTime }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[ScheduleTools] Failed to list schedules:', error)
    return { success: false, message, currentDateTime: formatLocalISOString() }
  }
}

export async function processScheduleCancel(args: ScheduleCancelArgs) {
  try {
    const currentDateTime = formatLocalISOString()
    if (!args.chat_uuid) {
      return { success: false, message: 'chat_uuid is required', currentDateTime }
    }
    const task = DatabaseService.getScheduledTaskById(args.id)
    if (!task) {
      return { success: false, message: `Scheduled task not found: ${args.id}`, currentDateTime }
    }
    if (task.chat_uuid !== args.chat_uuid) {
      return { success: false, message: 'Task does not belong to provided chat_uuid', currentDateTime }
    }
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return { success: false, message: `Cannot cancel task in status: ${task.status}`, currentDateTime }
    }
    DatabaseService.updateScheduledTaskStatus(task.id, 'cancelled', task.attempt_count, undefined, task.result_message_id ?? undefined)
    emitScheduleUpdated(task.id)
    return { success: true, id: task.id, currentDateTime }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[ScheduleTools] Failed to cancel schedule:', error)
    return { success: false, message, currentDateTime: formatLocalISOString() }
  }
}

export async function processScheduleUpdate(args: ScheduleUpdateArgs) {
  try {
    const currentDateTime = formatLocalISOString()
    if (!args.chat_uuid) {
      return { success: false, message: 'chat_uuid is required', currentDateTime }
    }
    const existing = DatabaseService.getScheduledTaskById(args.id)
    if (!existing) {
      return { success: false, message: `Scheduled task not found: ${args.id}`, currentDateTime }
    }
    if (existing.chat_uuid !== args.chat_uuid) {
      return { success: false, message: 'Task does not belong to provided chat_uuid', currentDateTime }
    }
    if (existing.status !== 'pending') {
      return { success: false, message: `Only pending tasks can be updated. Current status: ${existing.status}`, currentDateTime }
    }

    let nextRunAt = existing.run_at
    if (args.run_at) {
      const parsed = parseRunAt(args.run_at)
      if (parsed === null) {
        return { success: false, message: 'Invalid run_at format. Use ISO-8601 datetime string.', currentDateTime }
      }
      const minDelayCheck = ensureMinDelay(parsed)
      if (!minDelayCheck.ok) {
        return { success: false, message: minDelayCheck.message, currentDateTime }
      }
      nextRunAt = parsed
    }

    const updated = {
      ...existing,
      goal: args.goal ?? existing.goal,
      run_at: nextRunAt,
      timezone: args.timezone ?? existing.timezone,
      payload: args.payload ? JSON.stringify(args.payload) : existing.payload,
      max_attempts: typeof args.max_attempts === 'number' ? args.max_attempts : existing.max_attempts,
      updated_at: Date.now()
    }
    DatabaseService.updateScheduledTask(updated)
    emitScheduleUpdated(updated.id)
    return { success: true, task: updated, currentDateTime }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[ScheduleTools] Failed to update schedule:', error)
    return { success: false, message, currentDateTime: formatLocalISOString() }
  }
}
