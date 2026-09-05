import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTaskRow, ScheduledTaskRunRow } from '@main/db/dao/ScheduledTaskDao'
import { processSchedule } from '../ScheduleToolsProcessor'

const tasks: ScheduledTaskRow[] = []
const runs: ScheduledTaskRunRow[] = []
const mocks = vi.hoisted(() => ({ wake: vi.fn(), cancelTask: vi.fn(), emit: vi.fn() }))

vi.mock('@main/db/chat', () => ({ chatDb: { getChatByUuid: vi.fn(() => ({ id: 1 })) } }))
vi.mock('@main/services/scheduler/SchedulerService', () => ({
  schedulerService: { wake: mocks.wake, cancelTask: mocks.cancelTask }
}))
vi.mock('@main/services/scheduler/event-emitter', () => ({ ScheduleEventEmitter: class { emit = mocks.emit } }))
vi.mock('@main/db/planning', () => ({
  planningDb: {
    createScheduledTask: vi.fn((task: ScheduledTaskRow, run: ScheduledTaskRunRow) => { tasks.push({ ...task }); runs.push({ ...run }) }),
    updateScheduledTask: vi.fn((task: ScheduledTaskRow, run: ScheduledTaskRunRow) => {
      tasks[tasks.findIndex(item => item.id === task.id)] = { ...task }
      const index = runs.findIndex(item => item.task_id === task.id && item.status === 'pending')
      if (index >= 0) runs.splice(index, 1)
      runs.push({ ...run })
    }),
    getScheduledTaskById: vi.fn((id: string) => tasks.find(item => item.id === id)),
    getScheduledTasksByChatUuid: vi.fn((chatUuid: string) => tasks.filter(item => item.chat_uuid === chatUuid))
  }
}))

describe('ScheduleToolsProcessor', () => {
  beforeEach(() => {
    tasks.length = 0
    runs.length = 0
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-22T00:00:00Z')
    vi.clearAllMocks()
  })

  it('creates a once schedule and its first occurrence', async () => {
    const result = await processSchedule({ action: 'create', chat_uuid: 'chat-1', goal: 'once', run_at: '2026-07-22T01:00:00Z' })
    expect(result.success).toBe(true)
    expect(tasks[0]).toMatchObject({ schedule_type: 'once', cron_expression: null, status: 'pending', max_attempts: 3 })
    expect(runs[0]).toMatchObject({ task_id: tasks[0].id, scheduled_for: Date.parse('2026-07-22T01:00:00Z'), status: 'pending', execution_chat_uuid: null })
    expect(mocks.wake).toHaveBeenCalledOnce()
  })

  it('creates a cron schedule in its timezone', async () => {
    const result = await processSchedule({ action: 'create', chat_uuid: 'chat-1', goal: 'daily', cron_expression: '30 9 * * *', timezone: 'Asia/Shanghai' })
    expect(result.success).toBe(true)
    expect(tasks[0]).toMatchObject({ schedule_type: 'cron', cron_expression: '30 9 * * *', timezone: 'Asia/Shanghai' })
    expect(new Date(tasks[0].run_at).toISOString()).toBe('2026-07-22T01:30:00.000Z')
  })

  it('requires exactly one scheduling form', async () => {
    const result = await processSchedule({ action: 'create', chat_uuid: 'chat-1', goal: 'invalid', run_at: '2026-07-22T01:00:00Z', cron_expression: '0 9 * * *', timezone: 'UTC' })
    expect(result).toMatchObject({ success: false, message: expect.stringContaining('exactly one') })
  })

  it('requires a timezone offset for a once schedule', async () => {
    const result = await processSchedule({ action: 'create', chat_uuid: 'chat-1', goal: 'invalid', run_at: '2026-07-22T01:00:00' })
    expect(result).toMatchObject({ success: false, message: expect.stringContaining('timezone offset') })
  })

  it('rejects simultaneous specific day-of-month and day-of-week', async () => {
    const result = await processSchedule({ action: 'create', chat_uuid: 'chat-1', goal: 'invalid', cron_expression: '0 9 1 * 1', timezone: 'UTC' })
    expect(result).toMatchObject({ success: false, message: expect.stringContaining('day-of-month') })
  })

  it('updates a cron schedule and replaces its pending occurrence', async () => {
    await processSchedule({ action: 'create', chat_uuid: 'chat-1', goal: 'daily', cron_expression: '0 9 * * *', timezone: 'UTC' })
    const result = await processSchedule({ action: 'update', chat_uuid: 'chat-1', id: tasks[0].id, cron_expression: '15 10 * * *' })
    expect(result.success).toBe(true)
    expect(tasks[0].cron_expression).toBe('15 10 * * *')
    expect(runs).toHaveLength(1)
    expect(mocks.wake).toHaveBeenCalledTimes(2)
  })

  it('lists and cancels schedules within the chat boundary', async () => {
    await processSchedule({ action: 'create', chat_uuid: 'chat-1', goal: 'once', run_at: '2026-07-22T01:00:00Z' })
    expect((await processSchedule({ action: 'list', chat_uuid: 'chat-1' }) as any).tasks).toHaveLength(1)
    const result = await processSchedule({ action: 'cancel', chat_uuid: 'chat-1', id: tasks[0].id })
    expect(result.success).toBe(true)
    expect(mocks.cancelTask).toHaveBeenCalledWith(tasks[0].id)
  })

  it('requires action and reports the supported action set', async () => {
    expect(await processSchedule({})).toMatchObject({
      success: false,
      message: 'Missing required parameter: action'
    })
    expect(await processSchedule({ action: 'resume' })).toMatchObject({
      success: false,
      message: 'Invalid action: resume. Expected one of: create, list, cancel, update'
    })
  })

  it.each([
    [{ action: 'create' }, 'goal is required'],
    [{ action: 'cancel' }, 'id is required'],
    [{ action: 'update' }, 'id is required']
  ])('validates required fields for flat action payload %o', async (args, message) => {
    const result = await processSchedule(args as any)

    expect(result).toMatchObject({ success: false, message })
  })
})
