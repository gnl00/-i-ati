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
  Button: ({ children }: { children?: ReactNode }): ReactNode => <button>{children}</button>
}))

vi.mock('@renderer/shared/components/ui/traffic-lights', () => ({
  default: (): ReactNode => <div data-testid="traffic-lights" />
}))

vi.mock('@renderer/shared/components/ui/use-toast', () => ({
  toast: vi.fn()
}))

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

    useSheetStore.setState({ sheetOpenState: false })
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
    expect(chatTitleListProbe.render).toHaveBeenCalledTimes(initialRenderCount + 1)
  })
})
