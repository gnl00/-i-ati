import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_SCHEDULED_TASKS_GET_BY_CHAT_UUID,
  DB_SCHEDULED_TASK_UPDATE_STATUS
} from '@shared/constants'

const { ipcMainHandleMock } = vi.hoisted(() => ({
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
    getScheduledTasksByChatUuid: vi.fn(),
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

describe('registerScheduledTaskHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
  })

  it('registers chat-scoped scheduled task handlers', async () => {
    const { registerScheduledTaskHandlers } = await import('../scheduled-tasks')

    registerScheduledTaskHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)

    expect(registeredChannels).toContain(DB_SCHEDULED_TASKS_GET_BY_CHAT_UUID)
    expect(registeredChannels).toContain(DB_SCHEDULED_TASK_UPDATE_STATUS)
  })
})
