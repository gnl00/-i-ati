// @vitest-environment happy-dom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/features/settings', () => ({
  SettingsPanel: (): ReactNode => <div>Settings</div>
}))

vi.mock('@renderer/shared/components/ModeToggleSlide', () => ({
  ModeToggleSlide: (): ReactNode => <button type="button">Theme</button>
}))

vi.mock('@renderer/shared/components/ui/traffic-lights', () => ({
  default: (): ReactNode => <div>Traffic lights</div>
}))

vi.mock('@renderer/shared/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }): ReactNode => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }): ReactNode => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }): ReactNode => <>{children}</>
}))

vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeWindowClose: vi.fn(),
  invokeWindowMaximize: vi.fn(),
  invokeWindowMinimize: vi.fn()
}))

const { getEmotionStateMock } = vi.hoisted(() => ({
  getEmotionStateMock: vi.fn()
}))

vi.mock('@renderer/infrastructure/persistence/EmotionStateRepository', () => ({
  getEmotionState: getEmotionStateMock
}))

import { useChatStore } from '@renderer/features/chat/state/chatStore'
import ChatHeader, { useHeaderEmotion } from '../ChatHeader'

describe('ChatHeader', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    getEmotionStateMock.mockResolvedValue(undefined)
    useChatStore.setState({
      chatTitle: 'New chat',
      artifactsPanelOpen: false,
      currentChatId: null,
      messages: [],
      preview: { message: null }
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders the closed state and opens the Artifacts panel', async () => {
    await act(async () => root.render(<ChatHeader />))

    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open artifacts panel"]'
    )
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(toggle?.title).toBe('Open artifacts panel')
    expect(toggle?.querySelector('.lucide-panel-right')).toBeTruthy()
    expect(toggle?.querySelector('.lucide-panel-right')?.getAttribute('aria-hidden')).toBe('true')
    expect(toggle?.className).not.toContain('bg-black/[0.06]')

    await act(async () => toggle?.click())

    expect(useChatStore.getState().artifactsPanelOpen).toBe(true)
  })

  it('renders the open state and closes the Artifacts panel', async () => {
    useChatStore.setState({ artifactsPanelOpen: true })
    await act(async () => root.render(<ChatHeader />))

    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close artifacts panel"]'
    )
    expect(toggle?.getAttribute('aria-pressed')).toBe('true')
    expect(toggle?.title).toBe('Close artifacts panel')
    expect(toggle?.querySelector('.lucide-panel-right')).toBeTruthy()
    expect(toggle?.querySelector('.lucide-panel-right')?.getAttribute('aria-hidden')).toBe('true')
    expect(toggle?.className).toContain('bg-black/[0.06]')
    expect(toggle?.className).not.toContain('text-blue')

    await act(async () => toggle?.click())

    expect(useChatStore.getState().artifactsPanelOpen).toBe(false)
  })
})

describe('useHeaderEmotion', () => {
  let container: HTMLDivElement
  let root: Root
  let latestEmotion: ChatEmotionState | undefined

  const assistantMessage = (emotion?: ChatEmotionState): MessageEntity => ({
    body: {
      role: 'assistant',
      content: '',
      segments: [],
      ...(emotion ? { emotion } : {})
    }
  })

  function Probe() {
    latestEmotion = useHeaderEmotion()
    return null
  }

  const flushPromises = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestEmotion = undefined
    getEmotionStateMock.mockReset().mockResolvedValue(undefined)
    useChatStore.setState({
      currentChatId: 1,
      messages: [],
      preview: { message: null }
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    useChatStore.setState({
      currentChatId: null,
      messages: [],
      preview: { message: null }
    })
  })

  it('returns undefined on the welcome stage even with a transcript emotion', async () => {
    useChatStore.setState({
      currentChatId: null,
      messages: [assistantMessage({ label: 'calm', emoji: '😌', intensity: 0.2, source: 'tool' })]
    })

    await act(async () => root.render(<Probe />))
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toBeUndefined()
  })

  it('picks the latest assistant transcript emotion and ignores user messages', async () => {
    useChatStore.setState({
      messages: [
        {
          body: {
            role: 'user',
            content: 'hi',
            segments: [],
            emotion: { label: 'angry', emoji: '😠', intensity: 0.9, source: 'tool' }
          }
        },
        assistantMessage({ label: 'calm', emoji: '😌', intensity: 0.2, source: 'computed' }),
        assistantMessage({ label: 'excited', emoji: '🤩', intensity: 0.9, source: 'tool' })
      ]
    })

    await act(async () => root.render(<Probe />))
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toEqual({
      label: 'excited',
      emoji: '🤩',
      intensity: 0.9,
      source: 'tool'
    })
  })

  it('prefers the preview message emotion over the transcript', async () => {
    useChatStore.setState({
      messages: [assistantMessage({ label: 'calm', emoji: '😌', intensity: 0.2, source: 'computed' })],
      preview: {
        message: assistantMessage({ label: 'excited', emoji: '🤩', intensity: 0.9, source: 'tool' })
      }
    })

    await act(async () => root.render(<Probe />))
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toEqual({
      label: 'excited',
      emoji: '🤩',
      intensity: 0.9,
      source: 'tool'
    })
  })

  it('falls back to the persisted db snapshot when the transcript has no emotion', async () => {
    getEmotionStateMock.mockResolvedValue({
      current: { label: ' Happiness ', intensity: 8.6, updatedAt: 1710000000000 }
    })

    await act(async () => root.render(<Probe />))
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toMatchObject({
      label: 'happiness',
      intensity: 8.6,
      source: 'computed'
    })
  })

  it('returns undefined when the db snapshot fails and the transcript has no emotion', async () => {
    getEmotionStateMock.mockRejectedValue(new Error('failed'))

    await act(async () => root.render(<Probe />))
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toBeUndefined()
  })
})
