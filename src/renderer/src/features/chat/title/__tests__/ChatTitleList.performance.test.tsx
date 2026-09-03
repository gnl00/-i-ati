// @vitest-environment happy-dom

import { act, Profiler } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  deleteChat: vi.fn(),
  updateChat: vi.fn()
}))

const ipcMocks = vi.hoisted(() => ({
  invokeDbChatSearch: vi.fn()
}))

const sonnerMocks = vi.hoisted(() => ({
  warning: vi.fn()
}))

vi.mock('@renderer/infrastructure/persistence/ChatRepository', () => repositoryMocks)
vi.mock('@renderer/infrastructure/ipc', () => ipcMocks)
vi.mock('sonner', () => ({ toast: sonnerMocks }))

vi.mock('framer-motion', () => {
  const MotionDiv = ({ children, className }: { children?: ReactNode; className?: string }): ReactNode => (
    <div className={className}>{children}</div>
  )
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }): ReactNode => <>{children}</>,
    motion: { div: MotionDiv }
  }
})

import { useChatStore } from '@renderer/features/chat/state/chatStore'
import ChatTitleList from '../ChatTitleList'

describe('ChatTitleList performance behavior', () => {
  let container: HTMLDivElement
  let root: Root
  let chatOne: ChatEntity
  let chatTwo: ChatEntity

  const renderList = async (
    onChatClick: (event: React.MouseEvent<HTMLDivElement>, result: ChatSearchResult) => void = vi.fn(),
    onDeletedCurrentChat: () => void = vi.fn(),
    onRender?: React.ProfilerOnRenderCallback
  ): Promise<void> => {
    await act(async () => {
      root.render(
        <Profiler id="chat-title-list" onRender={onRender ?? (() => undefined)}>
          <ChatTitleList
            onChatClick={onChatClick}
            onDeletedCurrentChat={onDeletedCurrentChat}
          />
        </Profiler>
      )
    })
    await act(async () => Promise.resolve())
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const now = Date.now()
    chatOne = {
      id: 1,
      uuid: 'chat-one',
      title: 'Newest chat',
      messages: [],
      msgCount: 4,
      updateTime: now,
      createTime: now
    }
    chatTwo = {
      id: 2,
      uuid: 'chat-two',
      title: 'Older chat',
      messages: [],
      msgCount: 2,
      updateTime: now - 8 * 24 * 60 * 60 * 1000,
      createTime: now - 8 * 24 * 60 * 60 * 1000
    }

    repositoryMocks.deleteChat.mockReset().mockResolvedValue(undefined)
    repositoryMocks.updateChat.mockReset().mockResolvedValue(undefined)
    ipcMocks.invokeDbChatSearch.mockReset().mockResolvedValue([])
    sonnerMocks.warning.mockReset()
    useChatStore.setState({
      chatList: [chatOne, chatTwo],
      currentChatId: 1,
      currentChatUuid: chatOne.uuid
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders grouped rows with CSS hover and off-screen containment', async () => {
    await renderList()

    const rows = [...container.querySelectorAll<HTMLElement>('[data-chat-title-row]')]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.className.includes('[content-visibility:auto]'))).toBe(true)
    expect(rows.every(row => row.className.includes('[contain-intrinsic-size:auto_44px]'))).toBe(true)

    const title = rows[0]?.querySelector<HTMLElement>('.line-clamp-1')
    expect(title?.className).toContain('group-hover:text-gray-900')
    expect(title?.className).toContain('dark:group-hover:text-(--app-text-primary)')

    const count = rows[0]?.querySelector<HTMLElement>('.rounded-full')
    expect(count?.className).toContain('group-hover:pointer-events-none')
    expect(count?.className).toContain('group-hover:translate-x-2')

    const actions = rows[0]?.querySelector<HTMLElement>('.absolute.inset-0.flex.items-center.gap-1')
    expect(actions?.className).toContain('group-hover:pointer-events-auto')
    expect(actions?.className).toContain('group-hover:opacity-100')

    const stickyHeader = container.querySelector<HTMLElement>('.sticky')
    expect(stickyHeader?.className).toContain('sticky')
  })

  it('keeps pointer hover changes out of the React commit path', async () => {
    let updateCommits = 0
    await renderList(undefined, undefined, (_id, phase) => {
      if (phase === 'update') {
        updateCommits += 1
      }
    })

    const initialUpdateCommits = updateCommits
    const rows = [...container.querySelectorAll<HTMLElement>('[data-chat-title-row]')]
    await act(async () => {
      rows.forEach(row => {
        row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      })
    })

    expect(updateCommits).toBe(initialUpdateCommits)
  })

  it('skips unchanged parent renders while responding to its own selection and list updates', async () => {
    const readTitle = vi.fn(() => 'Newest chat')
    Object.defineProperty(chatOne, 'title', { configurable: true, get: readTitle })
    const onChatClick = vi.fn()
    const onDeletedCurrentChat = vi.fn()
    await renderList(onChatClick, onDeletedCurrentChat)
    expect(readTitle).toHaveBeenCalled()
    readTitle.mockClear()

    await renderList(onChatClick, onDeletedCurrentChat)
    expect(readTitle).not.toHaveBeenCalled()

    await act(async () => useChatStore.setState({ currentChatId: 2 }))
    expect(readTitle).toHaveBeenCalled()
    const rows = container.querySelectorAll<HTMLElement>('[data-chat-title-row]')
    expect(rows[1].className).toContain('from-blue-50/80')
    expect(rows[0].className).not.toContain('from-blue-50/80')

    await act(async () => useChatStore.setState({
      chatList: [chatOne, { ...chatTwo, title: 'Updated older chat' }]
    }))
    expect(container.textContent).toContain('Updated older chat')
  })

  it('keeps selection, edit, and delete interactions working', async () => {
    const onChatClick = vi.fn()
    const onDeletedCurrentChat = vi.fn()
    await renderList(onChatClick, onDeletedCurrentChat)

    const rows = [...container.querySelectorAll<HTMLElement>('[data-chat-title-row]')]
    await act(async () => rows[1]?.click())
    expect(onChatClick).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chat: chatTwo })
    )

    const editButton = rows[0]?.querySelector<HTMLButtonElement>('button')
    await act(async () => editButton?.click())
    const titleInput = container.querySelector<HTMLInputElement>('input.h-7')
    expect(titleInput?.value).toBe(chatOne.title)

    if (titleInput) {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      await act(async () => {
        setValue?.call(titleInput, 'Renamed chat')
        titleInput.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    expect(repositoryMocks.updateChat).toHaveBeenCalled()

    const deleteButton = container
      .querySelectorAll<HTMLElement>('[data-chat-title-row]')[0]
      ?.querySelectorAll<HTMLButtonElement>('button')[1]
    await act(async () => deleteButton?.click())
    expect(repositoryMocks.deleteChat).toHaveBeenCalledWith(chatOne.id)
    expect(onDeletedCurrentChat).toHaveBeenCalledTimes(1)
  })

  it('uses the larger intrinsic size and CSS hover classes for search rows', async () => {
    const searchResult: ChatSearchResult = {
      chat: chatOne,
      matchSource: 'message',
      matchedMessageId: 10,
      matchedTimestamp: chatOne.updateTime,
      snippet: 'needle appears in this message',
      messageHitCount: 1,
      score: 1
    }
    ipcMocks.invokeDbChatSearch.mockResolvedValue([searchResult])
    await renderList()

    const searchButton = container.querySelector<HTMLButtonElement>('button[aria-label="Search chats"]')
    await act(async () => searchButton?.click())

    const input = container.querySelector<HTMLInputElement>('input[placeholder="Search titles and messages..."]')
    expect(input).not.toBeNull()
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setValue?.call(input, 'needle')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 220))
    })

    const searchRow = container.querySelector<HTMLElement>('[data-chat-title-row]')
    expect(searchRow?.className).toContain('[content-visibility:auto]')
    expect(searchRow?.className).toContain('[contain-intrinsic-size:auto_88px]')
    expect(searchRow?.querySelector('.line-clamp-1')?.className).toContain('group-hover:text-gray-900')
  })
})
