import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_SCHEDULED_TASKS_LIST,
  DB_SCHEDULED_TASK_UPDATE_STATUS
} from '@shared/constants'

const { getScheduledTasksMock, ipcMainHandleMock } = vi.hoisted(() => ({
  getScheduledTasksMock: vi.fn(),
  ipcMainHandleMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: vi.fn(),
  }
}))

vi.mock('@main/db/planning', () => ({
  planningDb: {
    getScheduledTaskById: vi.fn(),
    getScheduledTasks: getScheduledTasksMock,
    updateScheduledTaskStatus: vi.fn()
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@main/services/scheduler/event-emitter', () => ({
  ScheduleEventEmitter: class {
    emit = vi.fn()
  }
}))

vi.mock('@main/services/scheduler/SchedulerService', () => ({
  schedulerService: {
    cancelTask: vi.fn(),
    dismissTask: vi.fn()
  }
}))

describe('registerScheduledTaskHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
    getScheduledTasksMock.mockReset()
  })

  it('registers scheduled task handlers', async () => {
    const { registerScheduledTaskHandlers } = await import('../scheduled-tasks')

    registerScheduledTaskHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)

    expect(registeredChannels).toContain(DB_SCHEDULED_TASKS_LIST)
    expect(registeredChannels).toContain(DB_SCHEDULED_TASK_UPDATE_STATUS)
  })

  it('lists scheduled tasks across chats', async () => {
    const tasks = [{ id: 'task-1', chat_uuid: 'chat-1' }]
    getScheduledTasksMock.mockReturnValue(tasks)

    const { registerScheduledTaskHandlers } = await import('../scheduled-tasks')

    registerScheduledTaskHandlers()

    const handler = ipcMainHandleMock.mock.calls.find(([channel]) => channel === DB_SCHEDULED_TASKS_LIST)?.[1]

    await expect(handler()).resolves.toBe(tasks)
    expect(getScheduledTasksMock).toHaveBeenCalledTimes(1)
  })
})
