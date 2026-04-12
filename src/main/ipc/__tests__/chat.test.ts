import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RUN_CANCEL,
  RUN_COMPRESSION_EXECUTE,
  RUN_START,
  RUN_TITLE_GENERATE,
  RUN_TOOL_CONFIRM
} from '@shared/constants'

const { ipcMainHandleMock } = vi.hoisted(() => ({
  ipcMainHandleMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/orchestration/chat/run', () => ({
  RunService: class {
    start = vi.fn()
    cancel = vi.fn()
    resolveToolConfirmation = vi.fn()
    executeCompression = vi.fn()
    generateTitle = vi.fn()
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveChat: vi.fn(),
    getAllChats: vi.fn(),
    getChatById: vi.fn(),
    updateChat: vi.fn(),
    deleteChat: vi.fn(),
    addSkill: vi.fn(),
    removeSkill: vi.fn(),
    getSkills: vi.fn(),
    saveAssistant: vi.fn(),
    getAllAssistants: vi.fn(),
    getAssistantById: vi.fn(),
    updateAssistant: vi.fn(),
    deleteAssistant: vi.fn()
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

describe('registerChatHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
  })

  it('registers run handlers on new run:* channels while keeping legacy request aliases', async () => {
    const { registerChatHandlers } = await import('../chat')

    registerChatHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)

    expect(registeredChannels).toContain(RUN_START)
    expect(registeredChannels).toContain('chat-run:start')
    expect(registeredChannels).toContain(RUN_CANCEL)
    expect(registeredChannels).toContain('chat-run:cancel')
    expect(registeredChannels).toContain(RUN_TOOL_CONFIRM)
    expect(registeredChannels).toContain('chat-run:tool-confirm')
    expect(registeredChannels).toContain(RUN_COMPRESSION_EXECUTE)
    expect(registeredChannels).toContain('chat-compression:execute')
    expect(registeredChannels).toContain(RUN_TITLE_GENERATE)
    expect(registeredChannels).toContain('chat-title:generate')
    expect(registeredChannels).not.toContain('chat-run:event')
  })
})
