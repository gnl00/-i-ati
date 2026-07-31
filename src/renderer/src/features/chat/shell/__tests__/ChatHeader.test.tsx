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

import { useChatStore } from '@renderer/features/chat/state/chatStore'
import ChatHeader from '../ChatHeader'

describe('ChatHeader', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useChatStore.setState({
      chatTitle: 'New chat',
      artifactsPanelOpen: false
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
