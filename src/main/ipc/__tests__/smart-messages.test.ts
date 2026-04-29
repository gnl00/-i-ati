import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_SMART_MESSAGE_DISMISS,
  DB_SMART_MESSAGES_GET_ACTIVE,
  DB_SMART_MESSAGES_REFRESH
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
    getActiveSmartMessages: vi.fn(),
    dismissSmartMessage: vi.fn()
  }
}))

vi.mock('@main/services/smartMessages', () => ({
  smartMessageGenerationService: {
    generate: vi.fn()
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

describe('registerSmartMessageHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
  })

  it('registers smart message handlers', async () => {
    const { registerSmartMessageHandlers } = await import('../smart-messages')

    registerSmartMessageHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)

    expect(registeredChannels).toContain(DB_SMART_MESSAGES_GET_ACTIVE)
    expect(registeredChannels).toContain(DB_SMART_MESSAGE_DISMISS)
    expect(registeredChannels).toContain(DB_SMART_MESSAGES_REFRESH)
  })
})
