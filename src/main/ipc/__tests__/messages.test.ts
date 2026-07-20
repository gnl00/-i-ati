import { createHash } from 'node:crypto'
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

const { chatDbMock, ipcMainHandleMock } = vi.hoisted(() => ({
  ipcMainHandleMock: vi.fn(),
  chatDbMock: {
    saveMessage: vi.fn(),
    getAllMessages: vi.fn((): any[] => []),
    getMessageById: vi.fn(),
    getMessageByIds: vi.fn((): any[] => []),
    getMessagesByChatId: vi.fn((): any[] => []),
    getMessagesByChatUuid: vi.fn((): any[] => []),
    updateMessage: vi.fn(),
    patchMessageUiState: vi.fn(),
    deleteMessage: vi.fn(),
    getReadyToolResultCompactionsByMessageIds: vi.fn((): any[] => []),
    saveCompressedSummary: vi.fn(),
    getCompressedSummariesByChatId: vi.fn(),
    getActiveCompressedSummariesByChatId: vi.fn(),
    updateCompressedSummaryStatus: vi.fn(),
    deleteCompressedSummary: vi.fn()
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/db/chat', () => ({
  chatDb: chatDbMock
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    getToolMetadata: vi.fn(() => ({
      resultCompaction: {
        enabled: true,
        level: 'balanced',
        compactorId: 'web-document'
      }
    }))
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
    vi.clearAllMocks()
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

  it('overlays ready tool-result compactions in chat-scoped history reads', async () => {
    chatDbMock.getMessagesByChatUuid.mockReturnValue([{
      id: 42,
      chatUuid: 'chat-1',
      body: {
        role: 'tool',
        name: 'web_fetch',
        toolCallId: 'call-42',
        content: 'raw result',
        segments: []
      }
    }])
    chatDbMock.getReadyToolResultCompactionsByMessageIds.mockReturnValue([{
      id: 7,
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'call-42',
      level: 'balanced',
      status: 'ready',
      content: 'compact result',
      originalHash: createHash('sha256').update('raw result').digest('hex'),
      originalCharacters: 10,
      compactedCharacters: 7,
      estimatedTokens: 2,
      compactorId: 'web-document',
      compactorVersion: 1,
      attempts: 1,
      createdAt: 1,
      updatedAt: 2
    }])
    const { registerMessageHandlers } = await import('../messages')

    registerMessageHandlers()
    const handler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === DB_MESSAGE_GET_BY_CHAT_UUID
    )?.[1]
    const messages = await handler({}, 'chat-1')

    expect(messages[0].body.content).toBe('compact result')
    expect(chatDbMock.getReadyToolResultCompactionsByMessageIds).toHaveBeenCalledWith([42])
  })

})
