import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_CHAT_GET_BY_ID,
  DB_PROVIDER_DEFINITIONS_GET_ALL,
  MCP_DISCONNECT,
  OPEN_EXTERNAL,
  RUN_CANCEL,
  SKILL_UNLOAD_ACTION,
  WIN_FULLSCREEN_STATE_GET,
  WEB_SEARCH_ACTION,
  WEB_FETCH_ACTION
} from '@shared/constants'
import {
  invokeDbChatGetById,
  invokeDbProviderDefinitionsGetAll,
  invokeMcpDisconnect,
  invokeOpenExternal,
  invokeRunCancel,
  invokeSkillUnload,
  invokeWindowFullScreenState,
  invokeWebSearchIPC,
  invokeWebFetchIPC
} from '..'

describe('renderer IPC domain contracts', () => {
  const ipcRenderer = {
    invoke: vi.fn()
  }

  beforeEach(() => {
    ipcRenderer.invoke.mockReset()
    vi.stubGlobal('window', { electron: { ipcRenderer } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns search discovery metadata through the search channel', async () => {
    const request = { param: 'Example', engine: 'bing' as const, fetchCounts: 2 }
    const response = {
      success: true,
      results: [{ query: 'Example', success: true, title: 'Example source', snippet: 'Source excerpt', link: 'https://example.com/source' }]
    }
    ipcRenderer.invoke.mockResolvedValue(response)
    await expect(invokeWebSearchIPC(request)).resolves.toEqual(response)
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(WEB_SEARCH_ACTION, request)
  })

  it('reads a selected source through the separate fetch channel', async () => {
    const request = { url: 'https://example.com/source', cleanMode: 'full' as const }
    const response = { success: true, url: request.url, title: 'Example source', content: 'Source body' }
    ipcRenderer.invoke.mockResolvedValue(response)
    await expect(invokeWebFetchIPC(request)).resolves.toEqual(response)
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(WEB_FETCH_ACTION, request)
  })

  it('uses the integrations channel and payload for MCP disconnect', async () => {
    const request = { name: 'filesystem' }
    ipcRenderer.invoke.mockResolvedValue({ success: true })

    await expect(invokeMcpDisconnect(request)).resolves.toEqual({ success: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(MCP_DISCONNECT, request)
  })

  it('deactivates one skill in the specified chat through the existing integrations handler', async () => {
    const result = { success: true, removed: true, message: 'Skill removed.' }
    ipcRenderer.invoke.mockResolvedValue(result)
    await expect(invokeSkillUnload('pdf', 'chat-a')).resolves.toEqual(result)
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(SKILL_UNLOAD_ACTION, { name: 'pdf', chat_uuid: 'chat-a' })
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

  it('queries the current window fullscreen state through the system channel', async () => {
    ipcRenderer.invoke.mockResolvedValue(true)

    await expect(invokeWindowFullScreenState()).resolves.toBe(true)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(WIN_FULLSCREEN_STATE_GET)
  })
})
