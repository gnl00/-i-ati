// @vitest-environment happy-dom

import { act } from 'react'
import type React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatStore } from '../../state/chatStore'

const mocks = vi.hoisted(() => ({
  state: {} as ChatStore,
  epoch: 0,
  pendingQuestions: [] as unknown[],
  invokeSkillList: vi.fn(),
  invokeSkillGetContent: vi.fn(),
  invokeSkillLoad: vi.fn(),
  invokeSkillUnload: vi.fn(),
  invokeEnsureWorkspaceDirectory: vi.fn(),
  getChatSkills: vi.fn(),
  saveChat: vi.fn(),
  updateChat: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('../../state/chatStore', () => ({
  useChatStore: Object.assign((selector: (state: ChatStore) => unknown) => selector(mocks.state), {
    getState: () => mocks.state
  })
}))
vi.mock('../../state/toolUserQuestionStore', () => ({
  useToolUserQuestionStore: { getState: (): { pendingRequests: unknown[] } => ({ pendingRequests: mocks.pendingQuestions }) }
}))
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeSkillList: mocks.invokeSkillList,
  invokeSkillGetContent: mocks.invokeSkillGetContent,
  invokeSkillLoad: mocks.invokeSkillLoad,
  invokeSkillUnload: mocks.invokeSkillUnload
}))
vi.mock('@renderer/infrastructure/tools/workspace/renderer/WorkspaceInvoker', () => ({
  invokeEnsureWorkspaceDirectory: mocks.invokeEnsureWorkspaceDirectory
}))
vi.mock('@renderer/infrastructure/persistence/ChatRepository', () => ({
  saveChat: mocks.saveChat,
  updateChat: mocks.updateChat
}))
vi.mock('@renderer/infrastructure/persistence/ChatSkillRepository', () => ({ getChatSkills: mocks.getChatSkills }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock('uuid', () => ({ v4: (): string => 'new-chat-uuid' }))

import { useSkillActivation } from '../useSkillActivation'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

describe('useSkillActivation', () => {
  let container: HTMLDivElement
  let root: Root
  let snapshot: ReturnType<typeof useSkillActivation>
  let unmounted: boolean
  const onChatCreated = vi.fn()

  function Probe(): React.JSX.Element | null {
    snapshot = useSkillActivation({ onChatCreated })
    return null
  }

  const render = async (): Promise<void> => {
    await act(async () => root.render(<Probe />))
  }
  const activate = async (name = 'pdf'): Promise<boolean> => {
    let result = false
    await act(async () => { result = await snapshot.activateSkill(name) })
    return result
  }
  const deactivate = async (name = 'pdf'): Promise<boolean> => {
    let result = false
    await act(async () => { result = await snapshot.deactivateSkill(name) })
    return result
  }
  const switchChat = (uuid = 'chat-b'): void => {
    mocks.epoch += 1
    mocks.state.currentChatId = 2
    mocks.state.currentChatUuid = uuid
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.epoch = 0
    mocks.pendingQuestions = []
    mocks.invokeSkillList.mockReset().mockResolvedValue([{ name: 'pdf', description: 'Work with PDFs' }])
    mocks.invokeSkillGetContent.mockReset().mockResolvedValue('# PDF')
    mocks.invokeSkillLoad.mockReset().mockResolvedValue({ success: true, loaded: true, contextInjected: true })
    mocks.invokeSkillUnload.mockReset().mockResolvedValue({ success: true, removed: true })
    mocks.invokeEnsureWorkspaceDirectory.mockReset().mockResolvedValue({
      success: true,
      path: '/tmp/user-data/workspaces/new-chat-uuid'
    })
    mocks.getChatSkills.mockReset().mockResolvedValue([])
    mocks.saveChat.mockReset().mockResolvedValue(9)
    mocks.updateChat.mockReset().mockResolvedValue(undefined)
    mocks.state = {
      currentChatId: 1,
      currentChatUuid: 'chat-a',
      chatSkillsRevisionByChatUuid: {},
      runPhase: 'idle',
      postRunJobs: { title: 'idle', compression: 'idle' },
      userInstruction: 'Use concise answers',
      selectedModelRef: { accountId: 'account', modelId: 'model' },
      permissionApprovalMode: 'manual',
      getSelectionEpoch: () => mocks.epoch,
      bumpChatSkillsRevision: vi.fn(),
      prependChatListEntry: vi.fn(),
      selectChatShell: vi.fn((id, uuid, chat) => {
        mocks.epoch += 1
        mocks.state.currentChatId = id
        mocks.state.currentChatUuid = uuid
        mocks.state.userInstruction = chat?.userInstruction ?? ''
        mocks.state.permissionApprovalMode = chat?.permissionApprovalMode ?? 'manual'
      })
    } as unknown as ChatStore
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    unmounted = false
  })

  afterEach(async () => {
    if (!unmounted) await act(async () => root.unmount())
    container.remove()
  })

  it('activates an existing chat through the shared load handler and reports repeated activation', async () => {
    mocks.getChatSkills.mockResolvedValue(['pdf'])
    await render()
    expect(snapshot.activeSkills).toEqual(['pdf'])
    expect(await activate()).toBe(true)
    expect(mocks.invokeSkillLoad).toHaveBeenCalledWith('pdf', 'chat-a')
    expect(mocks.state.bumpChatSkillsRevision).toHaveBeenCalledWith('chat-a')
    expect(mocks.success).toHaveBeenCalledWith('Skill already active: pdf')
    expect(mocks.saveChat).not.toHaveBeenCalled()
    expect(mocks.invokeSkillGetContent).not.toHaveBeenCalled()
  })

  it('validates Welcome skills before persistence, preserves session settings, and creates the workspace', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    expect(await activate()).toBe(true)
    expect(mocks.invokeEnsureWorkspaceDirectory).toHaveBeenCalledWith({
      chat_uuid: 'new-chat-uuid', workspace_path: './workspaces/new-chat-uuid'
    })
    expect(mocks.saveChat).toHaveBeenCalledWith(expect.objectContaining({
      uuid: 'new-chat-uuid', title: 'NewChat', messages: [],
      workspacePath: '/tmp/user-data/workspaces/new-chat-uuid', userInstruction: 'Use concise answers',
      modelRef: { accountId: 'account', modelId: 'model' }, permissionApprovalMode: 'manual'
    }))
    expect(mocks.invokeSkillGetContent.mock.invocationCallOrder[0]).toBeLessThan(mocks.saveChat.mock.invocationCallOrder[0])
    expect(mocks.invokeEnsureWorkspaceDirectory.mock.invocationCallOrder[0]).toBeLessThan(mocks.saveChat.mock.invocationCallOrder[0])
    expect(mocks.saveChat.mock.invocationCallOrder[0]).toBeLessThan(mocks.invokeSkillLoad.mock.invocationCallOrder[0])
    expect(mocks.invokeSkillLoad).toHaveBeenCalledWith('pdf', 'new-chat-uuid')
    expect(onChatCreated).toHaveBeenCalledWith('new-chat-uuid')
    expect(onChatCreated.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(mocks.state.selectChatShell).mock.invocationCallOrder[0])
    expect(mocks.state.selectChatShell).toHaveBeenCalledWith(9, 'new-chat-uuid', expect.any(Object))
  })

  it('does not create a Welcome chat for an unknown name or unreadable skill file', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    expect(await activate('PDF')).toBe(false)
    expect(mocks.error).toHaveBeenLastCalledWith('Skill not found: PDF')
    mocks.invokeSkillGetContent.mockRejectedValueOnce(new Error('Skill file is unreadable'))
    expect(await activate()).toBe(false)
    expect(mocks.error).toHaveBeenLastCalledWith('Skill file is unreadable')
    expect(mocks.saveChat).not.toHaveBeenCalled()
    expect(mocks.invokeEnsureWorkspaceDirectory).not.toHaveBeenCalled()
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
  })

  it('retains a saved Welcome shell for retry after activation failure', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    mocks.invokeSkillLoad.mockResolvedValueOnce({ success: false, loaded: false, message: 'Skill file changed' })
    await render()
    expect(await activate()).toBe(false)
    expect(mocks.state.prependChatListEntry).toHaveBeenCalledTimes(1)
    expect(mocks.state.selectChatShell).toHaveBeenCalledTimes(1)
    expect(onChatCreated).toHaveBeenCalledTimes(1)
    expect(mocks.error).toHaveBeenCalledWith('Skill file changed')
    expect(await activate()).toBe(true)
    expect(mocks.saveChat).toHaveBeenCalledTimes(1)
    expect(mocks.invokeSkillLoad).toHaveBeenCalledTimes(2)
  })

  it.each(['workspace', 'save'] as const)('keeps Welcome unchanged when %s creation fails', async step => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    if (step === 'workspace') {
      mocks.invokeEnsureWorkspaceDirectory.mockResolvedValueOnce({ success: false, error: 'Workspace is unavailable' })
    } else {
      mocks.saveChat.mockRejectedValueOnce(new Error('Database is unavailable'))
    }
    await render()
    expect(await activate()).toBe(false)
    expect(mocks.state.currentChatId).toBeNull()
    expect(mocks.state.prependChatListEntry).not.toHaveBeenCalled()
    expect(mocks.state.selectChatShell).not.toHaveBeenCalled()
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith(step === 'workspace' ? 'Workspace is unavailable' : 'Database is unavailable')
  })

  it('saves the latest Welcome settings after asynchronous skill validation', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    const content = deferred<string>()
    mocks.invokeSkillGetContent.mockReturnValueOnce(content.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    mocks.state.userInstruction = 'Latest instruction'
    mocks.state.permissionApprovalMode = 'auto'
    mocks.state.selectedModelRef = { accountId: 'latest-account', modelId: 'latest-model' }
    await act(async () => content.resolve('# PDF'))
    expect(await pending).toBe(true)
    expect(mocks.saveChat).toHaveBeenCalledWith(expect.objectContaining({
      userInstruction: 'Latest instruction', permissionApprovalMode: 'auto',
      modelRef: { accountId: 'latest-account', modelId: 'latest-model' }
    }))
  })

  it.each([true, false])('preserves later settings while the saved Welcome shell finishes loading (success=%s)', async success => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    const saved = deferred<number>()
    const corrected = deferred<void>()
    const loaded = deferred<{ success: boolean; loaded: boolean; message?: string }>()
    mocks.saveChat.mockReturnValueOnce(saved.promise)
    mocks.updateChat.mockReturnValueOnce(corrected.promise)
    mocks.invokeSkillLoad.mockReturnValueOnce(loaded.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    mocks.state.userInstruction = 'Edited during save'
    mocks.state.permissionApprovalMode = 'auto'
    mocks.state.selectedModelRef = { accountId: 'save-account', modelId: 'save-model' }
    await act(async () => saved.resolve(9))
    expect(mocks.updateChat).toHaveBeenCalledWith(expect.objectContaining({
      id: 9, userInstruction: 'Edited during save', permissionApprovalMode: 'auto',
      modelRef: { accountId: 'save-account', modelId: 'save-model' }
    }))
    expect(mocks.state.currentChatUuid).toBe('new-chat-uuid')
    expect(mocks.state.userInstruction).toBe('Edited during save')
    expect(mocks.state.permissionApprovalMode).toBe('auto')
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()

    // The shell is already selected, so its normal setters own these later edits.
    mocks.state.userInstruction = 'Edited during settings update'
    mocks.state.permissionApprovalMode = 'manual'
    await act(async () => corrected.resolve())
    expect(mocks.invokeSkillLoad).toHaveBeenCalledWith('pdf', 'new-chat-uuid')
    mocks.state.userInstruction = 'Edited during skill load'
    mocks.state.selectedModelRef = { accountId: 'load-account', modelId: 'load-model' }
    await act(async () => loaded.resolve({ success, loaded: success, message: 'Cannot read skill' }))
    expect(await pending).toBe(success)
    expect(mocks.state.userInstruction).toBe('Edited during skill load')
    expect(mocks.state.permissionApprovalMode).toBe('manual')
    expect(mocks.state.selectedModelRef).toEqual({ accountId: 'load-account', modelId: 'load-model' })
    expect(mocks.state.selectChatShell).toHaveBeenCalledTimes(1)
    expect(onChatCreated).toHaveBeenCalledTimes(1)
    expect(mocks.updateChat).toHaveBeenCalledTimes(1)
  })

  it('retains settings and the saved shell if its configuration correction fails', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    const saved = deferred<number>()
    mocks.saveChat.mockReturnValueOnce(saved.promise)
    mocks.updateChat.mockRejectedValueOnce(new Error('Cannot save settings'))
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    mocks.state.userInstruction = 'Retain this instruction'
    mocks.state.permissionApprovalMode = 'auto'
    await act(async () => saved.resolve(9))
    expect(await pending).toBe(false)
    expect(mocks.state.currentChatUuid).toBe('new-chat-uuid')
    expect(mocks.state.userInstruction).toBe('Retain this instruction')
    expect(mocks.state.permissionApprovalMode).toBe('auto')
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('Cannot save settings')
  })

  it('recognizes user navigation after its own Welcome shell selection', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    const saved = deferred<number>()
    const corrected = deferred<void>()
    mocks.saveChat.mockReturnValueOnce(saved.promise)
    mocks.updateChat.mockReturnValueOnce(corrected.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    mocks.state.userInstruction = 'Edited during save'
    await act(async () => saved.resolve(9))
    switchChat()
    await act(async () => corrected.resolve())
    expect(await pending).toBe(false)
    expect(mocks.state.currentChatUuid).toBe('chat-b')
    expect(mocks.state.selectChatShell).toHaveBeenCalledTimes(1)
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('shows catalog failures and supports a fresh retry', async () => {
    mocks.invokeSkillList.mockRejectedValueOnce(new Error('IPC unavailable'))
    await render()
    expect(snapshot.loading).toBe(false)
    expect(snapshot.loadError).toBe('Failed to load skills. Try again.')
    await act(async () => snapshot.refreshSkills())
    expect(snapshot.loadError).toBeNull()
    expect(snapshot.skills.map(skill => skill.name)).toEqual(['pdf'])
  })

  it.each(['streaming', 'post_run', 'cancelling'] as const)('refuses activation while the run is %s', async phase => {
    mocks.state.runPhase = phase
    await render()
    expect(await activate()).toBe(false)
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('Wait for the current task to finish before activating a skill')
  })

  it('refuses activation while a post-run job or user question is pending', async () => {
    await render()
    mocks.state.postRunJobs.compression = 'pending'
    expect(await activate()).toBe(false)
    mocks.state.postRunJobs.compression = 'idle'
    mocks.pendingQuestions = [{}]
    expect(await activate()).toBe(false)
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
  })

  it('locks concurrent submissions and stops before load if the run becomes busy during a read', async () => {
    await render()
    const read = deferred<string[]>()
    mocks.getChatSkills.mockReturnValueOnce(read.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    expect(snapshot.isUpdatingSkills).toBe(true)
    expect(await activate()).toBe(false)
    mocks.state.runPhase = 'streaming'
    await act(async () => read.resolve([]))
    expect(await pending).toBe(false)
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
    expect(snapshot.isUpdatingSkills).toBe(false)
  })

  it('ignores an activation after switching away and back to the same chat', async () => {
    await render()
    const catalog = deferred<SkillMetadata[]>()
    mocks.invokeSkillList.mockReturnValueOnce(catalog.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    switchChat()
    switchChat('chat-a')
    mocks.state.currentChatId = 1
    await act(async () => catalog.resolve([{ name: 'pdf', description: '' }]))
    expect(await pending).toBe(false)
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('does not persist a Welcome chat if reset occurs while creating its workspace', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    const directory = deferred<{ success: boolean }>()
    mocks.invokeEnsureWorkspaceDirectory.mockReturnValueOnce(directory.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    mocks.epoch += 1
    await act(async () => directory.resolve({ success: true }))
    expect(await pending).toBe(false)
    expect(mocks.saveChat).not.toHaveBeenCalled()
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
  })

  it('keeps a saved chat accessible without selecting it after a navigation race', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    const saved = deferred<number>()
    mocks.saveChat.mockReturnValueOnce(saved.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    switchChat()
    await act(async () => saved.resolve(9))
    expect(await pending).toBe(false)
    expect(mocks.state.prependChatListEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }))
    expect(mocks.state.selectChatShell).not.toHaveBeenCalled()
    expect(onChatCreated).not.toHaveBeenCalled()
    expect(mocks.invokeSkillLoad).not.toHaveBeenCalled()
  })

  it.each(['switch', 'unmount'] as const)('invalidates the activated source chat without feedback after %s', async action => {
    await render()
    const loaded = deferred<{ success: boolean; loaded: boolean }>()
    mocks.invokeSkillLoad.mockReturnValueOnce(loaded.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.activateSkill('pdf') })
    if (action === 'switch') switchChat()
    else {
      await act(async () => root.unmount())
      unmounted = true
    }
    await act(async () => loaded.resolve({ success: true, loaded: true }))
    expect(await pending).toBe(false)
    expect(mocks.state.bumpChatSkillsRevision).toHaveBeenCalledWith('chat-a')
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.state.selectChatShell).not.toHaveBeenCalled()
  })

  it('deactivates the persistent chat skill and reads the remaining DB names without requiring its catalog entry', async () => {
    mocks.getChatSkills.mockResolvedValueOnce(['orphan', 'pdf'])
    await render()
    mocks.getChatSkills.mockResolvedValueOnce(['pdf', 'another-skill'])
    expect(await deactivate('orphan')).toBe(true)

    expect(mocks.invokeSkillUnload).toHaveBeenCalledExactlyOnceWith('orphan', 'chat-a')
    expect(mocks.getChatSkills).toHaveBeenLastCalledWith(1)
    expect(snapshot.activeSkills).toEqual(['pdf', 'another-skill'])
    expect(mocks.state.bumpChatSkillsRevision).toHaveBeenCalledExactlyOnceWith('chat-a')
    expect(mocks.success).toHaveBeenCalledWith('Skill deactivated: orphan')
    expect(snapshot.isUpdatingSkills).toBe(false)
    expect(mocks.invokeSkillList).toHaveBeenCalledTimes(1)
    expect(mocks.invokeSkillGetContent).not.toHaveBeenCalled()
    expect(mocks.invokeEnsureWorkspaceDirectory).not.toHaveBeenCalled()
    expect(mocks.saveChat).not.toHaveBeenCalled()
    expect(mocks.state.selectChatShell).not.toHaveBeenCalled()
  })

  it.each(['failure', 'not-removed', 'rejection'] as const)('preserves active names when deactivation returns %s', async outcome => {
    mocks.getChatSkills.mockResolvedValue(['pdf'])
    if (outcome === 'rejection') {
      mocks.invokeSkillUnload.mockRejectedValueOnce(new Error('Unload IPC unavailable'))
    } else {
      mocks.invokeSkillUnload.mockResolvedValueOnce({
        success: outcome === 'not-removed', removed: false, message: 'Cannot remove skill'
      })
    }
    await render()
    expect(await deactivate()).toBe(false)
    expect(snapshot.activeSkills).toEqual(['pdf'])
    expect(snapshot.isUpdatingSkills).toBe(false)
    expect(mocks.state.bumpChatSkillsRevision).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith(outcome === 'rejection' ? 'Unload IPC unavailable' : 'Cannot remove skill')
  })

  it('keeps current active names and releases the mutation lock if the remaining names cannot be read', async () => {
    mocks.getChatSkills.mockResolvedValueOnce(['pdf'])
    await render()
    mocks.getChatSkills.mockRejectedValueOnce(new Error('Cannot read remaining skills'))
    expect(await deactivate()).toBe(false)
    expect(snapshot.activeSkills).toEqual(['pdf'])
    expect(mocks.state.bumpChatSkillsRevision).toHaveBeenCalledWith('chat-a')
    expect(snapshot.isUpdatingSkills).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith('Cannot read remaining skills')
  })

  it('rejects deactivation on Welcome without creating a persistent chat', async () => {
    mocks.state.currentChatId = null
    mocks.state.currentChatUuid = null
    await render()
    expect(await deactivate()).toBe(false)
    expect(mocks.invokeSkillUnload).not.toHaveBeenCalled()
    expect(mocks.saveChat).not.toHaveBeenCalled()
    expect(mocks.invokeEnsureWorkspaceDirectory).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('Current chat is unavailable')
  })

  it.each(['submitting', 'streaming', 'post_run', 'cancelling'] as const)('refuses deactivation while the run is %s', async phase => {
    mocks.state.runPhase = phase
    await render()
    expect(await deactivate()).toBe(false)
    expect(mocks.invokeSkillUnload).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('Wait for the current task to finish before deactivating a skill')
  })

  it.each(['title', 'compression', 'question'] as const)('refuses deactivation while %s is pending', async pending => {
    await render()
    if (pending === 'question') mocks.pendingQuestions = [{}]
    else mocks.state.postRunJobs[pending] = 'pending'
    expect(await deactivate()).toBe(false)
    expect(mocks.invokeSkillUnload).not.toHaveBeenCalled()
  })

  it('shares one synchronous lock across activation, deactivation, and repeated clicks', async () => {
    await render()
    const catalog = deferred<SkillMetadata[]>()
    mocks.invokeSkillList.mockReturnValueOnce(catalog.promise)
    let activation!: Promise<boolean>
    await act(async () => { activation = snapshot.activateSkill('pdf') })
    expect(snapshot.isUpdatingSkills).toBe(true)
    expect(await deactivate()).toBe(false)
    expect(mocks.invokeSkillUnload).not.toHaveBeenCalled()
    await act(async () => catalog.resolve([{ name: 'pdf', description: '' }]))
    expect(await activation).toBe(true)

    const unloaded = deferred<{ success: boolean; removed: boolean }>()
    mocks.invokeSkillUnload.mockReturnValueOnce(unloaded.promise)
    let deactivation!: Promise<boolean>
    await act(async () => { deactivation = snapshot.deactivateSkill('pdf') })
    expect(snapshot.isUpdatingSkills).toBe(true)
    expect(await deactivate()).toBe(false)
    expect(await activate()).toBe(false)
    expect(mocks.invokeSkillUnload).toHaveBeenCalledTimes(1)
    expect(mocks.invokeSkillLoad).toHaveBeenCalledTimes(1)
    expect(mocks.invokeSkillList).toHaveBeenCalledTimes(2)
    await act(async () => unloaded.resolve({ success: true, removed: true }))
    expect(await deactivation).toBe(true)
    expect(snapshot.isUpdatingSkills).toBe(false)
  })

  it('rejects a stale label callback after navigation before the next input render', async () => {
    mocks.getChatSkills.mockResolvedValue(['pdf'])
    await render()
    const staleDeactivate = snapshot.deactivateSkill
    switchChat()
    let result = true
    await act(async () => { result = await staleDeactivate('pdf') })
    expect(result).toBe(false)
    expect(mocks.invokeSkillUnload).not.toHaveBeenCalled()
    expect(mocks.state.bumpChatSkillsRevision).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it.each(['switch', 'switch-back', 'unmount'] as const)('invalidates the deactivated source chat without feedback after %s', async action => {
    mocks.getChatSkills.mockResolvedValue(['pdf'])
    await render()
    const unloaded = deferred<{ success: boolean; removed: boolean }>()
    mocks.invokeSkillUnload.mockReturnValueOnce(unloaded.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.deactivateSkill('pdf') })
    if (action === 'unmount') {
      await act(async () => root.unmount())
      unmounted = true
    } else {
      switchChat()
      if (action === 'switch-back') {
        switchChat('chat-a')
        mocks.state.currentChatId = 1
      }
    }
    await act(async () => unloaded.resolve({ success: true, removed: true }))
    expect(await pending).toBe(false)
    expect(mocks.state.bumpChatSkillsRevision).toHaveBeenCalledExactlyOnceWith('chat-a')
    expect(mocks.getChatSkills.mock.calls.filter(([id]) => id === 1)).toHaveLength(1)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.state.selectChatShell).not.toHaveBeenCalled()
  })

  it('ignores a remaining-skills read from the old chat after navigating to a new chat', async () => {
    mocks.getChatSkills.mockResolvedValueOnce(['pdf'])
    await render()
    const remaining = deferred<string[]>()
    mocks.getChatSkills.mockReturnValueOnce(remaining.promise)
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.deactivateSkill('pdf') })
    switchChat()
    mocks.getChatSkills.mockResolvedValueOnce(['other-chat-skill'])
    await render()
    expect(snapshot.activeSkills).toEqual(['other-chat-skill'])
    await act(async () => remaining.resolve(['old-chat-skill']))
    expect(await pending).toBe(false)
    expect(snapshot.activeSkills).toEqual(['other-chat-skill'])
    expect(mocks.state.currentChatUuid).toBe('chat-b')
    expect(mocks.state.bumpChatSkillsRevision).toHaveBeenCalledExactlyOnceWith('chat-a')
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('keeps the new chat names and feedback when the previous chat unload rejects after navigation', async () => {
    mocks.getChatSkills.mockResolvedValueOnce(['pdf'])
    await render()
    const unloaded = deferred<void>()
    mocks.invokeSkillUnload.mockReturnValueOnce(unloaded.promise.then(() => {
      throw new Error('Old chat unload failed')
    }))
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.deactivateSkill('pdf') })
    switchChat()
    mocks.getChatSkills.mockResolvedValueOnce(['other-chat-skill'])
    await render()
    await act(async () => unloaded.resolve())
    expect(await pending).toBe(false)
    expect(snapshot.activeSkills).toEqual(['other-chat-skill'])
    expect(mocks.state.bumpChatSkillsRevision).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('reflects an already persisted deactivation when an external run starts while the IPC is completing', async () => {
    mocks.getChatSkills.mockResolvedValueOnce(['pdf'])
    await render()
    const unloaded = deferred<{ success: boolean; removed: boolean }>()
    mocks.invokeSkillUnload.mockReturnValueOnce(unloaded.promise)
    mocks.getChatSkills.mockResolvedValueOnce([])
    let pending!: Promise<boolean>
    await act(async () => { pending = snapshot.deactivateSkill('pdf') })
    mocks.state.runPhase = 'streaming'
    await act(async () => unloaded.resolve({ success: true, removed: true }))
    expect(await pending).toBe(true)
    expect(snapshot.activeSkills).toEqual([])
    expect(mocks.success).toHaveBeenCalledWith('Skill deactivated: pdf')
  })
})
