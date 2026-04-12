import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_MESSAGE_DELETE,
  DB_MESSAGE_GET_ALL,
  DB_MESSAGE_GET_BY_ID,
  DB_MESSAGE_GET_BY_IDS,
  DB_MESSAGE_GET_BY_CHAT_ID,
  DB_MESSAGE_GET_BY_CHAT_UUID,
  DB_MESSAGE_PATCH_UI_STATE,
  DB_MESSAGE_SAVE,
  DB_MESSAGE_UPDATE
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
    saveMessage: vi.fn(),
    getAllMessages: vi.fn(),
    getMessageById: vi.fn(),
    getMessageByIds: vi.fn(),
    getMessagesByChatId: vi.fn(),
    getMessagesByChatUuid: vi.fn(),
    updateMessage: vi.fn(),
    patchMessageUiState: vi.fn(),
    deleteMessage: vi.fn(),
    saveCompressedSummary: vi.fn(),
    getCompressedSummariesByChatId: vi.fn(),
    getActiveCompressedSummariesByChatId: vi.fn(),
    updateCompressedSummaryStatus: vi.fn(),
    deleteCompressedSummary: vi.fn()
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

describe('registerMessageHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
  })

  it('registers chat-scoped message handlers', async () => {
    const { registerMessageHandlers } = await import('../messages')

    registerMessageHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)

    expect(registeredChannels).toContain(DB_MESSAGE_SAVE)
    expect(registeredChannels).toContain(DB_MESSAGE_GET_ALL)
    expect(registeredChannels).toContain(DB_MESSAGE_GET_BY_ID)
    expect(registeredChannels).toContain(DB_MESSAGE_GET_BY_IDS)
    expect(registeredChannels).toContain(DB_MESSAGE_GET_BY_CHAT_ID)
    expect(registeredChannels).toContain(DB_MESSAGE_GET_BY_CHAT_UUID)
    expect(registeredChannels).toContain(DB_MESSAGE_UPDATE)
    expect(registeredChannels).toContain(DB_MESSAGE_PATCH_UI_STATE)
    expect(registeredChannels).toContain(DB_MESSAGE_DELETE)
  })
})
