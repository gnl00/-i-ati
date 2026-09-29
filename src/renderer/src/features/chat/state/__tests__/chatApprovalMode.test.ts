import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { defaultPermissionApprovalMode: 'manual' } as IAppConfig,
  setAppConfig: vi.fn(),
  updateChat: vi.fn(),
  updateRun: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: {
    getState: (): { getAppConfig: () => IAppConfig; setAppConfig: typeof mocks.setAppConfig } => ({
      getAppConfig: (): IAppConfig => mocks.config, setAppConfig: mocks.setAppConfig
    })
  }
}))
vi.mock('@renderer/infrastructure/persistence/ChatRepository', () => ({ updateChat: mocks.updateChat }))
vi.mock('@renderer/infrastructure/ipc', () => ({ invokeRunPermissionApprovalModeUpdate: mocks.updateRun }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import {
  createChatSessionActions, createInitialChatSessionState,
  type ChatSessionActions, type ChatSessionState
} from '../chatSessionStore'
import { createChatCoordinatorActions, type ChatCoordinatorActions } from '../chatCoordinatorStore'

function createStore(): ChatSessionState & ChatSessionActions & ChatCoordinatorActions {
  const state = {
    ...createInitialChatSessionState(),
    messages: [] as MessageEntity[],
    transcriptBuffersByChatUuid: {},
    getRunStatusForChat: (): object => ({
      runPhase: 'idle', postRunJobs: { title: 'idle', compression: 'idle' }, lastRunOutcome: 'idle'
    })
  }
  const set = (patch: Partial<typeof state> | ((value: typeof state) => Partial<typeof state>)): void => {
    Object.assign(state, typeof patch === 'function' ? patch(state) : patch)
  }
  const actions = {
    ...createChatSessionActions(set as never, (() => state) as never),
    ...createChatCoordinatorActions(set as never, (() => state) as never)
  }
  return Object.assign(state, actions)
}

function chat(id: number, mode: PermissionApprovalMode): ChatEntity {
  return {
    id, uuid: `chat-${id}`, title: `Chat ${id}`, messages: [],
    permissionApprovalMode: mode, createTime: 1, updateTime: 1
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('chat approval mode defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.config = { defaultPermissionApprovalMode: 'manual', tools: { memoryEnabled: true } }
    mocks.setAppConfig.mockReset().mockImplementation(async (config: IAppConfig) => {
      mocks.config = config
    })
    mocks.updateChat.mockReset().mockResolvedValue(undefined)
    mocks.updateRun.mockReset().mockResolvedValue({ updated: true })
  })

  it('initializes a fresh store and all blank shell paths from the loaded default', () => {
    mocks.config.defaultPermissionApprovalMode = 'auto'
    const store = createStore()
    expect(store.permissionApprovalMode).toBe('auto')

    store.chatList = [chat(1, 'manual')]
    store.selectChatShell(1, 'chat-1')
    expect(store.permissionApprovalMode).toBe('manual')
    store.resetChatContext()
    expect(store.permissionApprovalMode).toBe('auto')
    store.permissionApprovalMode = 'manual'
    store.selectChatShell(null, null)
    expect(store.permissionApprovalMode).toBe('auto')
    store.permissionApprovalMode = 'manual'
    store.hydrateUserInstructionDraft(null)
    expect(store.permissionApprovalMode).toBe('auto')
    expect(mocks.setAppConfig).not.toHaveBeenCalled()
  })

  it('saves an empty chat choice without requiring a persisted chat', async () => {
    const store = createStore()
    await store.setPermissionApprovalMode('auto')
    expect(mocks.config).toEqual({ defaultPermissionApprovalMode: 'auto', tools: { memoryEnabled: true } })
    expect(store.permissionApprovalMode).toBe('auto')
    expect(mocks.updateChat).not.toHaveBeenCalled()
    expect(mocks.updateRun).not.toHaveBeenCalled()
    store.resetChatContext()
    expect(store.permissionApprovalMode).toBe('auto')
    expect(createStore().permissionApprovalMode).toBe('auto')
  })

  it('updates the selected chat and active run while leaving other chats intact', async () => {
    const store = createStore()
    store.chatList = [chat(1, 'manual'), chat(2, 'manual')]
    store.selectChatShell(1, 'chat-1')
    await store.setPermissionApprovalMode('auto')
    expect(store.permissionApprovalMode).toBe('auto')
    expect(store.chatList.map(item => item.permissionApprovalMode)).toEqual(['auto', 'manual'])
    expect(mocks.updateRun).toHaveBeenCalledWith({ chatUuid: 'chat-1', permissionApprovalMode: 'auto' })

    store.selectChatShell(2, 'chat-2')
    store.hydrateUserInstructionDraft()
    store.applyReadyChat(chat(2, 'manual'))
    expect(store.permissionApprovalMode).toBe('manual')
    expect(mocks.config.defaultPermissionApprovalMode).toBe('auto')
    expect(mocks.setAppConfig).toHaveBeenCalledTimes(1)
    store.resetChatContext()
    expect(store.permissionApprovalMode).toBe('auto')
  })

  it('updates the default when actively reselecting the current chat mode', async () => {
    mocks.config.defaultPermissionApprovalMode = 'auto'
    const store = createStore()
    store.chatList = [chat(1, 'manual')]
    store.selectChatShell(1, 'chat-1')
    await store.setPermissionApprovalMode('manual')
    expect(mocks.config.defaultPermissionApprovalMode).toBe('manual')
    expect(mocks.updateChat).not.toHaveBeenCalled()
    expect(mocks.updateRun).toHaveBeenCalledWith({ chatUuid: 'chat-1', permissionApprovalMode: 'manual' })
  })

  it('serializes rapid choices and uses the last choice for both chat and default', async () => {
    const gate = deferred()
    mocks.setAppConfig.mockImplementationOnce(async (config: IAppConfig) => {
      await gate.promise
      mocks.config = config
    })
    const store = createStore()
    store.chatList = [chat(1, 'manual')]
    store.selectChatShell(1, 'chat-1')
    const first = store.setPermissionApprovalMode('auto')
    const last = store.setPermissionApprovalMode('manual')
    await Promise.resolve()
    expect(mocks.setAppConfig).toHaveBeenCalledTimes(1)
    expect(store.permissionApprovalMode).toBe('manual')
    gate.resolve()
    await Promise.all([first, last])
    expect(mocks.config.defaultPermissionApprovalMode).toBe('manual')
    expect(store.chatList[0].permissionApprovalMode).toBe('manual')
    expect(store.permissionApprovalMode).toBe('manual')
    expect(mocks.updateRun.mock.calls.map(([input]) => input.permissionApprovalMode)).toEqual(['auto', 'manual'])
  })

  it('keeps another selected chat intact when a save resolves late', async () => {
    const gate = deferred()
    mocks.updateChat.mockReturnValueOnce(gate.promise)
    const store = createStore()
    store.chatList = [chat(1, 'manual'), chat(2, 'manual')]
    store.selectChatShell(1, 'chat-1')
    const save = store.setPermissionApprovalMode('auto')
    await vi.waitFor(() => expect(mocks.updateChat).toHaveBeenCalled())
    store.selectChatShell(2, 'chat-2')
    gate.resolve()
    await save
    expect(store.currentChatUuid).toBe('chat-2')
    expect(store.permissionApprovalMode).toBe('manual')
    expect(store.chatList[0].permissionApprovalMode).toBe('auto')
    expect(mocks.updateRun).toHaveBeenCalledWith({ chatUuid: 'chat-1', permissionApprovalMode: 'auto' })
  })

  it('applies a late saved default to a new blank shell', async () => {
    const gate = deferred()
    mocks.setAppConfig.mockImplementationOnce(async (config: IAppConfig) => {
      await gate.promise
      mocks.config = config
    })
    const store = createStore()
    store.chatList = [chat(1, 'manual')]
    store.selectChatShell(1, 'chat-1')
    const save = store.setPermissionApprovalMode('auto')
    store.resetChatContext()
    gate.resolve()
    await save
    expect(store.currentChatUuid).toBeNull()
    expect(store.permissionApprovalMode).toBe('auto')
  })

  it('reports default persistence failure and allows the next selection to succeed', async () => {
    mocks.setAppConfig.mockRejectedValueOnce(new Error('disk full'))
    const store = createStore()
    store.chatList = [chat(1, 'manual')]
    store.selectChatShell(1, 'chat-1')
    await store.setPermissionApprovalMode('auto')
    expect(store.permissionApprovalMode).toBe('manual')
    expect(mocks.config.defaultPermissionApprovalMode).toBe('manual')
    expect(mocks.updateChat).not.toHaveBeenCalled()
    expect(mocks.updateRun).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to save the default approval mode')
    await store.setPermissionApprovalMode('auto')
    expect(store.permissionApprovalMode).toBe('auto')
  })

  it('reports chat persistence failure and preserves the actual saved chat mode', async () => {
    mocks.updateChat.mockRejectedValueOnce(new Error('disk full'))
    const store = createStore()
    store.chatList = [chat(1, 'manual')]
    store.selectChatShell(1, 'chat-1')
    await store.setPermissionApprovalMode('auto')
    expect(mocks.config.defaultPermissionApprovalMode).toBe('auto')
    expect(store.permissionApprovalMode).toBe('manual')
    expect(store.chatList[0].permissionApprovalMode).toBe('manual')
    expect(mocks.updateRun).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Default saved, but failed to save this chat’s approval mode')
  })

  it('shows the last committed default when a later queued blank choice fails', async () => {
    mocks.setAppConfig.mockImplementationOnce(async (config: IAppConfig) => {
      mocks.config = config
    }).mockRejectedValueOnce(new Error('disk full'))
    const store = createStore()
    const first = store.setPermissionApprovalMode('auto')
    const last = store.setPermissionApprovalMode('manual')
    await Promise.all([first, last])
    expect(mocks.config.defaultPermissionApprovalMode).toBe('auto')
    expect(store.permissionApprovalMode).toBe('auto')
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to save the default approval mode')
  })

  it('reports runtime update failure and retries it when the saved mode is reselected', async () => {
    mocks.updateRun.mockRejectedValueOnce(new Error('IPC unavailable'))
    const store = createStore()
    store.chatList = [chat(1, 'manual')]
    store.selectChatShell(1, 'chat-1')
    await store.setPermissionApprovalMode('auto')
    expect(store.permissionApprovalMode).toBe('auto')
    expect(mocks.toastError).toHaveBeenCalledWith('Approval mode saved, but failed to update the active run')
    await store.setPermissionApprovalMode('auto')
    expect(mocks.updateRun).toHaveBeenCalledTimes(2)
    expect(mocks.updateChat).toHaveBeenCalledTimes(1)
  })
})
