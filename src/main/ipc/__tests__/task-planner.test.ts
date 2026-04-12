import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_TASK_PLAN_DELETE,
  DB_TASK_PLAN_GET_BY_ID,
  DB_TASK_PLAN_GET_BY_CHAT_UUID,
  DB_TASK_PLAN_SAVE,
  DB_TASK_PLAN_STEP_UPDATE_STATUS,
  DB_TASK_PLAN_STEP_UPSERT,
  DB_TASK_PLAN_UPDATE,
  DB_TASK_PLAN_UPDATE_STATUS
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
    saveTaskPlan: vi.fn(),
    updateTaskPlan: vi.fn(),
    updateTaskPlanStatus: vi.fn(),
    getTaskPlanById: vi.fn(),
    getTaskPlansByChatUuid: vi.fn(),
    deleteTaskPlan: vi.fn(),
    upsertTaskPlanStep: vi.fn(),
    updateTaskPlanStepStatus: vi.fn()
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

describe('registerTaskPlanHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
  })

  it('registers chat-scoped task plan handlers', async () => {
    const { registerTaskPlanHandlers } = await import('../task-planner')

    registerTaskPlanHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)

    expect(registeredChannels).toContain(DB_TASK_PLAN_SAVE)
    expect(registeredChannels).toContain(DB_TASK_PLAN_UPDATE)
    expect(registeredChannels).toContain(DB_TASK_PLAN_UPDATE_STATUS)
    expect(registeredChannels).toContain(DB_TASK_PLAN_GET_BY_ID)
    expect(registeredChannels).toContain(DB_TASK_PLAN_GET_BY_CHAT_UUID)
    expect(registeredChannels).toContain(DB_TASK_PLAN_DELETE)
    expect(registeredChannels).toContain(DB_TASK_PLAN_STEP_UPSERT)
    expect(registeredChannels).toContain(DB_TASK_PLAN_STEP_UPDATE_STATUS)
  })
})
