// @vitest-environment happy-dom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chatTitleListProbe = vi.hoisted(() => ({
  render: vi.fn()
}))

const ipcMocks = vi.hoisted(() => ({
  invokeDbScheduledTasksList: vi.fn(),
  invokeOpenExternal: vi.fn(),
  invokeWindowClose: vi.fn(),
  invokeWindowMaximize: vi.fn(),
  invokeWindowMinimize: vi.fn(),
  subscribeScheduleEvents: vi.fn()
}))

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn()
}))

vi.mock('@renderer/features/chat/title/ChatTitleList', () => ({
  default: (props: unknown) => {
    chatTitleListProbe.render(props)
    return <div data-testid="chat-title-list-probe" />
  }
}))

vi.mock('@renderer/features/chat/schedule/ChatScheduleBoard', () => ({
  default: (): ReactNode => <div data-testid="chat-schedule-board" />
}))

vi.mock('@renderer/shared/components/ui/sheet', () => {
  const Content = ({ children }: { children?: ReactNode }): ReactNode => <div>{children}</div>
  return {
    Sheet: ({ children }: { children?: ReactNode }): ReactNode => <div>{children}</div>,
    SheetContent: Content,
    SheetHeader: Content,
    SheetTitle: Content,
    SheetDescription: Content
  }
})

vi.mock('@renderer/shared/components/ui/button', () => ({
  Button: ({
    children,
    onClick
  }: {
    children?: ReactNode
    onClick?: () => void
  }): ReactNode => <button onClick={onClick}>{children}</button>
}))

vi.mock('@renderer/shared/components/ui/traffic-lights', () => ({
  default: (): ReactNode => <div data-testid="traffic-lights" />
}))

vi.mock('@renderer/shared/components/ui/use-toast', () => toastMocks)

vi.mock('@renderer/infrastructure/persistence/ChatRepository', () => ({
  getAllChat: vi.fn()
}))

vi.mock('@renderer/infrastructure/ipc', () => ipcMocks)

vi.mock('@renderer/features/workspace', () => ({
  switchWorkspace: vi.fn()
}))

vi.mock('@renderer/shared/logging/rendererLogger', () => ({
  createRendererLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }))
}))

import { getAllChat } from '@renderer/infrastructure/persistence/ChatRepository'
import { switchWorkspace } from '@renderer/features/workspace'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { useSheetStore } from '@renderer/features/chat/state/sheetStore'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import ChatSheet from '../ChatSheet'

type ChatTitleListProbeProps = {
  onChatClick: (event: unknown, result: ChatSearchResult) => Promise<void>
  onDeletedCurrentChat: () => void | Promise<void>
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('ChatSheet performance subscriptions', () => {
  let container: HTMLDivElement
  let root: Root

  const settleEffects = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    chatTitleListProbe.render.mockClear()
    toastMocks.toast.mockReset()
    vi.mocked(getAllChat).mockReset().mockResolvedValue([])
    vi.mocked(switchWorkspace).mockReset().mockResolvedValue({
      success: true,
      path: '/tmp/test-workspace',
      created: false
    })
    ipcMocks.invokeDbScheduledTasksList.mockReset().mockResolvedValue([])
    ipcMocks.invokeOpenExternal.mockReset()
    ipcMocks.invokeWindowClose.mockReset()
    ipcMocks.invokeWindowMaximize.mockReset()
    ipcMocks.invokeWindowMinimize.mockReset()
    ipcMocks.subscribeScheduleEvents.mockReset().mockReturnValue(vi.fn())

    useSheetStore.setState({
      sheetOpenState: false,
      chatLoading: false,
      chatEntranceRequest: null
    })
    useAppConfigStore.setState({ appVersion: 'test' })
    useChatStore.setState({
      chatList: [],
      currentChatId: null,
      currentChatUuid: null,
      messages: [],
      preview: { message: null }
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('keeps the title list mounted across transcript updates without rerendering it', async () => {
    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const initialRenderCount = chatTitleListProbe.render.mock.calls.length
    expect(initialRenderCount).toBeGreaterThan(0)

    await act(async () => {
      useChatStore.setState({
        preview: {
          message: {
            body: {
              role: 'assistant',
              content: 'streaming preview',
              segments: []
            }
          }
        }
      })
    })
    expect(chatTitleListProbe.render).toHaveBeenCalledTimes(initialRenderCount)

    await act(async () => {
      useChatStore.setState({ currentChatId: 42 })
    })
    expect(chatTitleListProbe.render).toHaveBeenCalledTimes(initialRenderCount)
  })

  it('keeps loading feedback through a real selection and clears it on success', async () => {
    const hydrateChat = vi.fn().mockResolvedValue(undefined)
    const workspace = createDeferred<{
      success: boolean
      path: string
      created: boolean
    }>()
    vi.mocked(switchWorkspace).mockReturnValueOnce(workspace.promise)
    useChatStore.setState({ hydrateChat })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    const result: ChatSearchResult = {
      chat: {
        id: 2,
        uuid: 'chat-two',
        title: 'Chat two',
        messages: [],
        createTime: 2,
        updateTime: 2
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: 2
    }
    const selection = props.onChatClick({}, result)

    await act(async () => Promise.resolve())
    expect(useSheetStore.getState().chatLoading).toBe(true)
    expect(vi.mocked(switchWorkspace)).toHaveBeenCalledWith('chat-two', undefined)

    workspace.resolve({ success: true, path: '/tmp/test-workspace', created: false })
    await act(async () => selection)

    expect(hydrateChat).toHaveBeenCalledWith(2, { isCurrent: expect.any(Function) })
    expect(useSheetStore.getState().chatLoading).toBe(false)
  })

  it('abandons a selection reset before hydration starts', async () => {
    const workspace = createDeferred<{
      success: boolean
      path: string
      created: boolean
    }>()
    vi.mocked(switchWorkspace).mockReturnValueOnce(workspace.promise)
    const hydrateChat = vi.fn()
    useChatStore.setState({
      currentChatId: 1,
      currentChatUuid: 'chat-one',
      hydrateChat
    })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    const selection = props.onChatClick({ detail: 1 }, {
      chat: {
        id: 2,
        uuid: 'chat-two',
        title: 'Chat two',
        messages: [],
        createTime: 2,
        updateTime: 2
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: 2
    })

    await act(async () => Promise.resolve())
    expect(vi.mocked(switchWorkspace)).toHaveBeenCalledWith('chat-two', undefined)

    await act(async () => {
      useChatStore.getState().resetChatContext()
    })
    workspace.resolve({ success: true, path: '/tmp/test-workspace', created: false })
    await act(async () => selection)

    expect(hydrateChat).not.toHaveBeenCalled()
    expect(useChatStore.getState().currentChatId).toBeNull()
    expect(useChatStore.getState().currentChatUuid).toBeNull()
    expect(useSheetStore.getState().chatLoading).toBe(false)
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('resets loading feedback and reports a current selection failure', async () => {
    vi.mocked(switchWorkspace).mockRejectedValueOnce(new Error('workspace unavailable'))
    const hydrateChat = vi.fn()
    useChatStore.setState({ hydrateChat })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    const result: ChatSearchResult = {
      chat: {
        id: 2,
        uuid: 'chat-two',
        title: 'Chat two',
        messages: [],
        createTime: 2,
        updateTime: 2
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: 2
    }

    await act(async () => props.onChatClick({ detail: 1 }, result))

    expect(hydrateChat).not.toHaveBeenCalled()
    expect(useSheetStore.getState().chatLoading).toBe(false)
    expect(toastMocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'There was a problem: workspace unavailable'
    }))
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('keeps the latest chat authoritative across overlapping selections', async () => {
    const workspaceA = createDeferred<{ success: boolean; path: string; created: boolean }>()
    const workspaceB = createDeferred<{ success: boolean; path: string; created: boolean }>()
    vi.mocked(switchWorkspace)
      .mockReturnValueOnce(workspaceA.promise)
      .mockReturnValueOnce(workspaceB.promise)
    const hydrateChat = vi.fn().mockResolvedValue(undefined)
    useChatStore.setState({ hydrateChat })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    const buildResult = (id: number): ChatSearchResult => ({
      chat: {
        id,
        uuid: `chat-${id}`,
        title: `Chat ${id}`,
        messages: [],
        createTime: id,
        updateTime: id
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: id
    })

    const selectionA = props.onChatClick({}, buildResult(1))
    await act(async () => Promise.resolve())
    const selectionB = props.onChatClick({}, buildResult(2))
    await act(async () => Promise.resolve())

    workspaceB.resolve({ success: true, path: '/tmp/test-workspace', created: false })
    await act(async () => selectionB)
    expect(hydrateChat).toHaveBeenCalledTimes(1)
    expect(hydrateChat).toHaveBeenCalledWith(2, { isCurrent: expect.any(Function) })
    expect(useSheetStore.getState().chatLoading).toBe(false)

    workspaceA.resolve({ success: true, path: '/tmp/test-workspace', created: false })
    await act(async () => selectionA)
    expect(hydrateChat).toHaveBeenCalledTimes(1)
    expect(useSheetStore.getState().chatLoading).toBe(false)
  })

  it('keeps New Chat current while an older hydration resolves', async () => {
    const hydration = createDeferred<void>()
    const hydrateChat = vi.fn(() => hydration.promise)
    useChatStore.setState({ currentChatId: 1, currentChatUuid: 'chat-one', hydrateChat })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    const selection = props.onChatClick({}, {
      chat: {
        id: 2,
        uuid: 'chat-two',
        title: 'Chat two',
        messages: [],
        createTime: 2,
        updateTime: 2
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: 2
    })

    await act(async () => Promise.resolve())
    expect(useSheetStore.getState().chatLoading).toBe(true)

    const newChatButton = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('New Chat'))
    expect(newChatButton).toBeDefined()
    await act(async () => newChatButton?.click())
    await settleEffects()
    expect(useChatStore.getState().currentChatId).toBeNull()
    expect(useChatStore.getState().currentChatUuid).toBeNull()
    expect(useSheetStore.getState().chatLoading).toBe(false)

    hydration.resolve()
    await act(async () => selection)
    expect(useChatStore.getState().currentChatId).toBeNull()
    expect(useChatStore.getState().currentChatUuid).toBeNull()
    expect(useSheetStore.getState().chatLoading).toBe(false)
  })

  it('keeps newer loading feedback when an obsolete hydration finishes first', async () => {
    const first = createDeferred<void>()
    const second = createDeferred<void>()
    const hydrateChat = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    useChatStore.setState({ currentChatId: 1, currentChatUuid: 'chat-one', hydrateChat })
    await act(async () => root.render(<ChatSheet />))
    await settleEffects()
    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    const result = (id: number): ChatSearchResult => ({
      chat: { id, uuid: `chat-${id}`, title: `Chat ${id}`, messages: [], createTime: id, updateTime: id },
      matchSource: 'title', messageHitCount: 0, score: 1
    })
    const selectionA = props.onChatClick({}, result(2))
    await settleEffects()
    const selectionB = props.onChatClick({}, result(3))
    await settleEffects()
    expect(hydrateChat).toHaveBeenCalledTimes(2)

    first.resolve()
    await act(async () => selectionA)
    expect(useSheetStore.getState().chatLoading).toBe(true)

    second.resolve()
    await act(async () => selectionB)
    expect(useSheetStore.getState().chatLoading).toBe(false)
  })

  it('uses current store selection for same-chat search without loading', async () => {
    const hydrateChat = vi.fn()
    const chat = {
      id: 1,
      uuid: 'chat-one',
      title: 'Chat one',
      messages: [],
      createTime: 1,
      updateTime: 1
    }
    useChatStore.setState({ currentChatId: 1, currentChatUuid: chat.uuid, hydrateChat })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    useChatStore.setState({ currentChatId: chat.id })
    useSheetStore.getState().setChatEntranceRequest({
      chatUuid: chat.uuid,
      selectionEpoch: useChatStore.getState().getSelectionEpoch()
    })
    await act(async () => props.onChatClick({ detail: 1 }, {
      chat,
      matchSource: 'message',
      matchedMessageId: 77,
      messageHitCount: 1,
      score: 1
    }))

    expect(hydrateChat).not.toHaveBeenCalled()
    expect(useSheetStore.getState().chatLoading).toBe(false)
    expect(useChatStore.getState().scrollHint).toEqual({
      type: 'search-result',
      chatUuid: chat.uuid,
      messageId: 77
    })
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('publishes one entrance request for a successful pointer selection', async () => {
    const hydrateChat = vi.fn().mockImplementation(async () => {
      useChatStore.setState({ currentChatId: 2, currentChatUuid: 'chat-two' })
    })
    useChatStore.setState({
      hydrateChat,
      messages: [{
        id: 2,
        chatUuid: 'chat-two',
        body: {
          role: 'assistant',
          content: 'Historical answer',
          segments: []
        }
      }]
    })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    const result: ChatSearchResult = {
      chat: {
        id: 2,
        uuid: 'chat-two',
        title: 'Chat two',
        messages: [],
        createTime: 2,
        updateTime: 2
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: 2
    }

    await act(async () => props.onChatClick({ detail: 1 }, result))

    expect(useSheetStore.getState().chatEntranceRequest).toEqual({
      chatUuid: 'chat-two',
      selectionEpoch: expect.any(Number)
    })
  })

  it('keeps an empty chat selection immediate without an entrance request', async () => {
    const hydrateChat = vi.fn().mockImplementation(async () => {
      useChatStore.setState({ currentChatId: 2, currentChatUuid: 'chat-two' })
    })
    useChatStore.setState({ hydrateChat, messages: [] })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    await act(async () => props.onChatClick({ detail: 1 }, {
      chat: {
        id: 2,
        uuid: 'chat-two',
        title: 'Chat two',
        messages: [],
        createTime: 2,
        updateTime: 2
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: 2
    }))

    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('keeps keyboard selection immediate without an entrance request', async () => {
    const hydrateChat = vi.fn().mockImplementation(async () => {
      useChatStore.setState({
        currentChatId: 2,
        currentChatUuid: 'chat-two',
        messages: [{
          id: 2,
          chatUuid: 'chat-two',
          body: {
            role: 'assistant',
            content: 'Keyboard-selected history',
            segments: []
          }
        }]
      })
    })
    useChatStore.setState({ hydrateChat, messages: [] })

    await act(async () => root.render(<ChatSheet />))
    await settleEffects()

    const props = chatTitleListProbe.render.mock.lastCall?.[0] as ChatTitleListProbeProps
    await act(async () => props.onChatClick({ detail: 0 }, {
      chat: {
        id: 2,
        uuid: 'chat-two',
        title: 'Chat two',
        messages: [],
        createTime: 2,
        updateTime: 2
      },
      matchSource: 'title',
      messageHitCount: 0,
      score: 2
    }))

    expect(hydrateChat).toHaveBeenCalledWith(2, { isCurrent: expect.any(Function) })
    expect(useChatStore.getState().currentChatUuid).toBe('chat-two')
    expect(useChatStore.getState().messages).toHaveLength(1)
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })
})
