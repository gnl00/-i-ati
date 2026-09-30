// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  getAllChat: vi.fn(),
  switchWorkspace: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@renderer/infrastructure/persistence/ChatRepository', () => ({
  getAllChat: mocks.getAllChat,
}))
vi.mock('@renderer/features/workspace', () => ({
  switchWorkspace: mocks.switchWorkspace,
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('../ChatScheduleBoard', () => ({
  taskTime: (time: number): string => String(time),
}))
import { SchedulerChats } from '../SchedulerChats'
import { useChatStore } from '../../state/chatStore'
import { useSheetStore } from '../../state/sheetStore'

const chat = (id: number, isScheduled = true): ChatEntity => ({
  id,
  uuid: `chat-${id}`,
  title: `Result ${id}`,
  isScheduled,
  createTime: id,
  updateTime: id,
  messages: [],
})
describe('SchedulerChats', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    mocks.getAllChat.mockResolvedValue([chat(1, false), chat(2), chat(3)])
    mocks.switchWorkspace.mockResolvedValue({ success: true })
    useChatStore.setState({
      chatList: [],
      tasksPageOpen: true,
      currentChatUuid: 'chat-3',
      currentChatId: 3,
    })
    useSheetStore.setState({ sheetOpenState: false })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })
  const render = async (): Promise<void> => {
    await act(async () => root.render(<SchedulerChats />))
  }
  const click = async (label: string): Promise<void> => {
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
        .click(),
    )
  }
  it('shows scheduled chats newest first and accepts background updates', async () => {
    await render()
    expect(
      [...container.querySelectorAll('button[aria-label^="Open "]')].map(
        (button) => button.textContent,
      ),
    ).toEqual(['Result 33', 'Result 22'])
    await act(async () => useChatStore.getState().updateChatList(chat(4)))
    expect(
      container.querySelector('button[aria-label^="Open "]')?.textContent,
    ).toBe('Result 44')
    await click('Open Result 3')
    expect(useChatStore.getState().tasksPageOpen).toBe(false)
  })
  it('reuses search expansion and resets the title filter when closed', async () => {
    await render()
    await click('Search chats')
    const input = container.querySelector<HTMLInputElement>('input')!
    expect(input.placeholder).toBe('Search titles...')
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'Result 2')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(
      container.querySelectorAll('button[aria-label^="Open "]'),
    ).toHaveLength(1)
    await click('Close search')
    expect(
      container.querySelectorAll('button[aria-label^="Open "]'),
    ).toHaveLength(2)
  })

  it('keeps Tasks open and reports workspace failures', async () => {
    mocks.switchWorkspace.mockResolvedValue({
      success: false,
      error: 'Unavailable',
    })
    await render()
    await click('Open Result 2')
    expect(useChatStore.getState().tasksPageOpen).toBe(true)
    expect(mocks.error).toHaveBeenCalledWith('Unable to open execution chat', {
      description: 'Unavailable',
    })
  })
  it('ignores navigation completion after another selection', async () => {
    let resolve!: (result: { success: boolean }) => void
    mocks.switchWorkspace.mockReturnValue(
      new Promise((result) => {
        resolve = result
      }),
    )
    const hydrate = vi.spyOn(useChatStore.getState(), 'hydrateChat')
    await render()
    await click('Open Result 2')
    useChatStore.getState().setTasksPageOpen(false)
    await act(async () => resolve({ success: true }))
    expect(hydrate).not.toHaveBeenCalled()
  })
  it('shows a load error and empty state', async () => {
    mocks.getAllChat.mockRejectedValue(new Error('Load failed'))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Load failed',
    )
  })
  it('shows an empty state when no scheduled chats exist', async () => {
    mocks.getAllChat.mockResolvedValue([chat(1, false)])
    await render()
    expect(container.textContent).toContain('No chats yet')
  })
})
