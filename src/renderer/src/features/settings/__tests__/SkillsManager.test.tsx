// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SkillsManager from '../skills/SkillsManager'
import { toast } from 'sonner'

const mocks = vi.hoisted(() => ({
  chatState: {
    currentChatId: 1 as number | null,
    currentChatUuid: 'chat-1' as string | null,
    chatSkillsRevisionByChatUuid: {} as Record<string, number>
  },
  appConfig: { skills: { folders: ['/team/skills'] } },
  list: vi.fn(),
  active: vi.fn(),
  open: vi.fn(),
  reveal: vi.fn(),
  remove: vi.fn(),
  config: vi.fn()
}))
vi.mock('../skills/SkillService', () => ({ listAvailableSkills: mocks.list }))
vi.mock('@renderer/infrastructure/persistence/ChatSkillRepository', () => ({
  getChatSkills: mocks.active
}))
vi.mock('@renderer/features/chat', () => ({
  useChatStore: (): typeof mocks.chatState => mocks.chatState
}))
vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (): {
    appConfig: { skills: { folders: string[] } }
    setAppConfig: typeof mocks.config
  } => ({
    appConfig: mocks.appConfig,
    setAppConfig: mocks.config
  })
}))
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeOpenPath: mocks.open,
  invokeDeleteSkill: mocks.remove,
  invokeRevealSkillInFolder: mocks.reveal,
  invokeCheckIsDirectory: vi.fn(),
  invokeImportSkills: vi.fn(),
  invokeSelectDirectory: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let root: Root
const skills = [
  {
    name: 'code-review',
    description: 'Review changes.',
    allowedTools: ['unique-tool'],
    compatibility: 'Local repositories.'
  },
  { name: 'guide', description: 'Workspace guide.', source: 'built-in' },
  { name: 'long-description', description: 'Long content. '.repeat(30) }
]
const render = async (): Promise<void> => {
  await act(async () => root.render(<SkillsManager />))
}
const button = (label: string): HTMLButtonElement => {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label
  )!
}
const click = async (label: string): Promise<void> => {
  await act(async () => button(label).click())
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.chatState.currentChatId = 1
  mocks.chatState.currentChatUuid = 'chat-1'
  mocks.chatState.chatSkillsRevisionByChatUuid = {}
  mocks.active.mockReset()
  mocks.list.mockResolvedValue(skills)
  mocks.active.mockResolvedValue(['code-review'])
  mocks.open.mockResolvedValue({ success: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
it('keeps details collapsed, shows current-chat state, and filters hidden metadata', async () => {
  await render()
  expect(container.textContent).toContain('3 skills')
  expect(container.querySelector('details')?.open).toBe(false)
  expect(
    container.querySelector('[title="Active in the current chat"]')
  ).not.toBeNull()
  expect(container.querySelectorAll('details')).toHaveLength(1)
  const input = container.querySelector<HTMLInputElement>(
    '[placeholder="Search installed skills"]'
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, 'unique-tool')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.textContent).toContain('1 results')
  expect(container.textContent).not.toContain('Workspace guide.')
  expect(container.textContent).toContain('Local repositories.')
  expect(container.querySelector('details')?.open).toBe(false)
})

it('refreshes active skills after a same-chat activation revision', async () => {
  mocks.active.mockResolvedValueOnce([]).mockResolvedValueOnce(['guide'])
  await render()
  expect(container.querySelector('[title="Active in the current chat"]')).toBeNull()

  mocks.chatState.chatSkillsRevisionByChatUuid['chat-1'] = 1
  await render()

  expect(mocks.active).toHaveBeenCalledTimes(2)
  const activeBadge = container.querySelector('[title="Active in the current chat"]')
  expect(activeBadge?.closest('.group')?.textContent).toContain('guide')
})

it('ignores active-skill reads that finish after switching chats', async () => {
  let resolveFirstSkills: (value: string[]) => void = () => undefined
  mocks.active
    .mockReturnValueOnce(new Promise<string[]>(resolve => { resolveFirstSkills = resolve }))
    .mockResolvedValueOnce(['guide'])
  await render()
  mocks.chatState.currentChatId = 2
  mocks.chatState.currentChatUuid = 'chat-2'
  await render()
  await act(async () => resolveFirstSkills(['code-review']))

  expect(mocks.active).toHaveBeenNthCalledWith(1, 1)
  expect(mocks.active).toHaveBeenNthCalledWith(2, 2)
  const activeBadges = container.querySelectorAll('[title="Active in the current chat"]')
  expect(activeBadges).toHaveLength(1)
  expect(activeBadges[0].closest('.group')?.textContent).toContain('guide')
})
it('offers accessible expansion only for truncated descriptions', async () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.textContent?.startsWith('Long content.') ? 100 : 30
    }
  )
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(36)
  await render()
  expect(
    [...container.querySelectorAll('button')].filter(
      (b) =>
        b.getAttribute('aria-label') ===
        'Expand description for long-description'
    )
  ).toHaveLength(1)
  await click('Expand description for long-description')
  const control = button('Collapse description for long-description')
  expect(control.getAttribute('aria-expanded')).toBe('true')
  expect(
    document.getElementById(control.getAttribute('aria-controls')!)?.className
  ).not.toContain('line-clamp-2')
  await click('Collapse description for long-description')
  expect(
    button('Expand description for long-description').getAttribute(
      'aria-expanded'
    )
  ).toBe('false')
})
it('opens folders separately from removing their configuration', async () => {
  await render()
  await click('Open folder /team/skills')
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith('/team/skills')
  await click('Remove folder /team/skills')
  expect(mocks.open).toHaveBeenCalledTimes(1)
  expect(mocks.config).toHaveBeenCalledWith({ skills: { folders: [] } })
  expect(container.textContent).toContain('0 folders')
})
it('preserves built-in protection and delete confirmation on failure', async () => {
  await render()
  const builtIn = button('Show guide in folder').closest('.group')!
  expect(builtIn.querySelector('[aria-label="Remove skill"]')).toBeNull()
  await click('Remove skill')
  expect(mocks.remove).not.toHaveBeenCalled()
  mocks.remove.mockRejectedValueOnce(new Error('Unavailable'))
  await click('Yes')
  expect(mocks.remove).toHaveBeenCalledWith('code-review')
  expect(container.textContent).toContain('Review changes.')
  expect(container.textContent).toContain('3 skills')
})

it('reveals skill files quietly and reports failures', async () => {
  await render()
  mocks.reveal.mockResolvedValueOnce({ success: true })
  await click('Show code-review in folder')
  expect(mocks.reveal).toHaveBeenCalledWith('code-review')
  expect(toast.success).not.toHaveBeenCalled()
  mocks.reveal.mockResolvedValueOnce({
    success: false,
    error: 'File unavailable'
  })
  await click('Show code-review in folder')
  expect(toast.error).toHaveBeenCalledWith('File unavailable')
})
