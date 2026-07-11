import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_CHAT_GET_BY_ID,
  DB_PROVIDER_DEFINITIONS_GET_ALL,
  MCP_DISCONNECT,
  OPEN_EXTERNAL,
  RUN_CANCEL
} from '@shared/constants'
import {
  invokeDbChatGetById,
  invokeDbProviderDefinitionsGetAll,
  invokeMcpDisconnect,
  invokeOpenExternal,
  invokeRunCancel
} from '..'

describe('renderer IPC domain contracts', () => {
  const ipcRenderer = {
    invoke: vi.fn()
  }

  beforeEach(() => {
    ipcRenderer.invoke.mockReset()
    ;(globalThis as any).window = { electron: { ipcRenderer } }
  })

  it('uses the integrations channel and payload for MCP disconnect', async () => {
    const request = { name: 'filesystem' }
    ipcRenderer.invoke.mockResolvedValue({ success: true })

    await expect(invokeMcpDisconnect(request)).resolves.toEqual({ success: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(MCP_DISCONNECT, request)
  })

  it('uses the persistence channel and identifier for chat lookup', async () => {
    const chat = { id: 42, uuid: 'chat-42' }
    ipcRenderer.invoke.mockResolvedValue(chat)

    await expect(invokeDbChatGetById(42)).resolves.toEqual(chat)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(DB_CHAT_GET_BY_ID, 42)
  })

  it('uses the providers channel for definition lookup', async () => {
    const definitions = [{ id: 'openai', name: 'OpenAI' }]
    ipcRenderer.invoke.mockResolvedValue(definitions)

    await expect(invokeDbProviderDefinitionsGetAll()).resolves.toEqual(definitions)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(DB_PROVIDER_DEFINITIONS_GET_ALL)
  })

  it('uses the run channel and cancellation payload', async () => {
    const request = { submissionId: 'submission-1', reason: 'user abort' }
    ipcRenderer.invoke.mockResolvedValue({ cancelled: true })

    await expect(invokeRunCancel(request)).resolves.toEqual({ cancelled: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(RUN_CANCEL, request)
  })

  it('uses the system channel and URL for external navigation', async () => {
    ipcRenderer.invoke.mockResolvedValue(undefined)

    await expect(invokeOpenExternal('https://example.com')).resolves.toBeUndefined()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(OPEN_EXTERNAL, 'https://example.com')
  })
})
