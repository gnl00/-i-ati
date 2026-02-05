import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTaskRow } from '@main/db/repositories/ScheduledTaskRepository'
import {
  processScheduleCancel,
  processScheduleCreate,
  processScheduleList,
  processScheduleUpdate
} from '../ScheduleToolsProcessor'

const taskStore: ScheduledTaskRow[] = []

vi.mock('@main/services/DatabaseService', () => ({
  default: {
    saveScheduledTask: vi.fn((task: ScheduledTaskRow) => {
      taskStore.push({ ...task })
    }),
    getScheduledTasksByChatUuid: vi.fn((chatUuid: string) => {
      return taskStore.filter(task => task.chat_uuid === chatUuid).map(task => ({ ...task }))
    }),
    getChatByUuid: vi.fn((chatUuid: string) => ({ id: 1, uuid: chatUuid })),
    saveChatSubmitEvent: vi.fn(() => 1),
    getScheduledTaskById: vi.fn((id: string) => {
      const task = taskStore.find(item => item.id === id)
      return task ? { ...task } : undefined
    }),
    updateScheduledTaskStatus: vi.fn((id: string, status: string, attemptCount: number, lastError?: string, resultMessageId?: number) => {
      const task = taskStore.find(item => item.id === id)
      if (!task) return
      task.status = status
      task.attempt_count = attemptCount
      task.last_error = lastError ?? null
      task.result_message_id = resultMessageId ?? null
      task.updated_at = Date.now()
    }),
    updateScheduledTask: vi.fn((task: ScheduledTaskRow) => {
      const index = taskStore.findIndex(item => item.id === task.id)
      if (index >= 0) {
        taskStore[index] = { ...task }
      }
    })
  }
}))

vi.mock('@main/services/chatSubmit/event-emitter', () => ({
  ChatSubmitEventEmitter: class {
    emit = vi.fn()
  }
}))

const now = new Date('2026-02-05T12:00:00.000Z')

describe('ScheduleToolsProcessor', () => {
  beforeEach(() => {
    taskStore.length = 0
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.clearAllMocks()
  })

  it('fails schedule_create when chat_uuid is missing', async () => {
    const res = await processScheduleCreate({
      goal: 'test',
      run_at: new Date(now.getTime() + 60000).toISOString()
    })
    expect(res.success).toBe(false)
    expect(res.message).toContain('chat_uuid')
  })

  it('fails schedule_create with invalid run_at format', async () => {
    const res = await processScheduleCreate({
      chat_uuid: 'chat-1',
      goal: 'test',
      run_at: 'not-a-date'
    })
    expect(res.success).toBe(false)
    expect(res.message).toContain('Invalid run_at')
  })

  it('fails schedule_create when run_at is too soon', async () => {
    const res = await processScheduleCreate({
      chat_uuid: 'chat-1',
      goal: 'test',
      run_at: new Date(now.getTime() + 5000).toISOString()
    })
    expect(res.success).toBe(false)
    expect(res.message).toContain('at least')
  })

  it('creates schedule_create with valid input', async () => {
    const res = await processScheduleCreate({
      chat_uuid: 'chat-1',
      goal: 'test',
      run_at: new Date(now.getTime() + 60000).toISOString(),
      payload: { prompt: 'hello' },
      max_attempts: 0
    })
    expect(res.success).toBe(true)
    expect(res.task).toBeDefined()
    expect(taskStore).toHaveLength(1)
    expect(taskStore[0].chat_uuid).toBe('chat-1')
    expect(taskStore[0].max_attempts).toBe(0)
  })

  it('lists schedules by chat_uuid', async () => {
    taskStore.push({
      id: 'task-1',
      chat_uuid: 'chat-1',
      plan_id: null,
      goal: 'test',
      run_at: now.getTime() + 60000,
      timezone: null,
      status: 'pending',
      payload: null,
      attempt_count: 0,
      max_attempts: 0,
      last_error: null,
      result_message_id: null,
      created_at: now.getTime(),
      updated_at: now.getTime()
    })
    const res = await processScheduleList({ chat_uuid: 'chat-1' })
    expect(res.success).toBe(true)
    expect(res.tasks?.length).toBe(1)
  })

  it('cancels a pending schedule', async () => {
    taskStore.push({
      id: 'task-2',
      chat_uuid: 'chat-2',
      plan_id: null,
      goal: 'test',
      run_at: now.getTime() + 60000,
      timezone: null,
      status: 'pending',
      payload: null,
      attempt_count: 1,
      max_attempts: 0,
      last_error: null,
      result_message_id: null,
      created_at: now.getTime(),
      updated_at: now.getTime()
    })
    const res = await processScheduleCancel({ chat_uuid: 'chat-2', id: 'task-2' })
    expect(res.success).toBe(true)
    expect(taskStore[0].status).toBe('cancelled')
  })

  it('updates a pending schedule', async () => {
    taskStore.push({
      id: 'task-3',
      chat_uuid: 'chat-3',
      plan_id: null,
      goal: 'test',
      run_at: now.getTime() + 60000,
      timezone: null,
      status: 'pending',
      payload: null,
      attempt_count: 0,
      max_attempts: 0,
      last_error: null,
      result_message_id: null,
      created_at: now.getTime(),
      updated_at: now.getTime()
    })
    const res = await processScheduleUpdate({
      chat_uuid: 'chat-3',
      id: 'task-3',
      goal: 'updated',
      run_at: new Date(now.getTime() + 120000).toISOString()
    })
    expect(res.success).toBe(true)
    expect(taskStore[0].goal).toBe('updated')
  })

  it('rejects cancel when task does not belong to chat_uuid', async () => {
    taskStore.push({
      id: 'task-4',
      chat_uuid: 'chat-owner',
      plan_id: null,
      goal: 'test',
      run_at: now.getTime() + 60000,
      timezone: null,
      status: 'pending',
      payload: null,
      attempt_count: 0,
      max_attempts: 0,
      last_error: null,
      result_message_id: null,
      created_at: now.getTime(),
      updated_at: now.getTime()
    })
    const res = await processScheduleCancel({ chat_uuid: 'chat-other', id: 'task-4' })
    expect(res.success).toBe(false)
    expect(res.message).toContain('chat_uuid')
    expect(taskStore[0].status).toBe('pending')
  })

  it('rejects update when task is not pending', async () => {
    taskStore.push({
      id: 'task-5',
      chat_uuid: 'chat-5',
      plan_id: null,
      goal: 'test',
      run_at: now.getTime() + 60000,
      timezone: null,
      status: 'running',
      payload: null,
      attempt_count: 1,
      max_attempts: 0,
      last_error: null,
      result_message_id: null,
      created_at: now.getTime(),
      updated_at: now.getTime()
    })
    const res = await processScheduleUpdate({
      chat_uuid: 'chat-5',
      id: 'task-5',
      goal: 'updated'
    })
    expect(res.success).toBe(false)
    expect(res.message).toContain('pending')
  })
})
