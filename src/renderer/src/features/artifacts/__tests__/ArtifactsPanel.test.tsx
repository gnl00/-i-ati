// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const workspaceFilesMock = vi.hoisted(() => vi.fn(() => ({
  workspaceTree: [],
  selectedFilePath: undefined,
  selectedFileContent: undefined,
  selectedFileName: undefined,
  workspacePath: '/workspace',
  isLoadingTree: false,
  isLoadingFile: false,
  handleFileSelect: vi.fn(),
  handleRefresh: vi.fn()
})))

vi.mock('../useWorkspaceFiles', () => ({
  useWorkspaceFiles: workspaceFilesMock
}))

vi.mock('../ArtifactsPreviewTab', () => ({
  ArtifactsPreviewTab: () => <div data-testid="preview-content">Preview content</div>
}))

vi.mock('../ArtifactsFilesTab', () => ({
  ArtifactsFilesTab: () => <div data-testid="files-content">Files content</div>,
  FilesTabToolbar: () => <div>Files toolbar</div>
}))

vi.mock('../ArtifactsFooter', () => ({
  ArtifactsFooter: () => <div data-testid="artifacts-footer">Workspace footer</div>
}))

vi.mock('@renderer/features/chat', async () => {
  const actual = await vi.importActual<typeof import('@renderer/features/chat')>('@renderer/features/chat')
  return {
    ...actual,
    ChatStatsPanel: () => <div>Stats content</div>
  }
})

import { useChatStore } from '@renderer/features/chat'
import { ArtifactsPanel } from '../ArtifactsPanel'

describe('ArtifactsPanel', () => {
  let container: HTMLDivElement
  let root: Root
  let rootIsMounted: boolean

  const renderPanel = async (): Promise<void> => {
    await act(async () => root.render(<ArtifactsPanel />))
    rootIsMounted = true
  }

  const dispatchKeyDown = async (event: KeyboardEvent): Promise<void> => {
    await act(async () => document.dispatchEvent(event))
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    workspaceFilesMock.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    rootIsMounted = false
    useChatStore.setState({
      currentChatUuid: 'chat-1',
      artifactsPanelOpen: true,
      artifactsActiveTab: 'tools',
      toolCallInspectorSelection: null
    })
  })

  afterEach(async () => {
    if (rootIsMounted) {
      await act(async () => root.unmount())
    }
    container.remove()
  })

  it('delays workspace loading until Preview or Files is opened and keeps it mounted', async () => {
    await renderPanel()
    expect(workspaceFilesMock).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="artifacts-footer"]')).toBeNull()

    await act(async () => useChatStore.getState().setArtifactsActiveTab('preview'))

    expect(workspaceFilesMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="tabpanel"][data-state="active"]')?.textContent)
      .toContain('Preview content')
    expect(container.querySelector('[data-testid="artifacts-footer"]')).toBeTruthy()

    await act(async () => useChatStore.getState().setArtifactsActiveTab('tools'))

    expect(workspaceFilesMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-testid="preview-content"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="artifacts-footer"]')).toBeNull()
  })

  it('keeps tab dimensions stable and exposes a visible keyboard focus treatment', async () => {
    await renderPanel()

    const toolsTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find(tab => tab.textContent === 'Tools')
    const toolsPanel = container.querySelector<HTMLElement>(
      '[role="tabpanel"][data-state="active"]'
    )

    expect(toolsTab?.className).toContain('min-w-12')
    expect(toolsTab?.className).toContain('focus-visible:ring-2')
    expect(toolsPanel?.className).not.toContain('animate-in')

    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close artifacts"]'
    )
    expect(closeButton?.title).toBe('Close artifacts (Esc)')
  })

  it('closes the panel with one Escape and preserves the active tab and tool selection', async () => {
    const selection = {
      chatUuid: 'chat-1',
      segmentId: 'segment-1',
      toolCallId: 'tool-call-1'
    }
    useChatStore.setState({
      artifactsActiveTab: 'tools',
      toolCallInspectorSelection: selection
    })
    await renderPanel()

    await dispatchKeyDown(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    }))

    const state = useChatStore.getState()
    expect(state.artifactsPanelOpen).toBe(false)
    expect(state.artifactsActiveTab).toBe('tools')
    expect(state.toolCallInspectorSelection).toEqual(selection)
  })

  it('closes the panel when Escape was already default prevented', async () => {
    await renderPanel()
    const escapeEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })
    escapeEvent.preventDefault()
    expect(escapeEvent.defaultPrevented).toBe(true)

    await dispatchKeyDown(escapeEvent)

    expect(useChatStore.getState().artifactsPanelOpen).toBe(false)
  })

  it('closes the panel before a child can stop Escape propagation', async () => {
    await renderPanel()
    const child = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close artifacts"]'
    )
    child?.addEventListener('keydown', event => event.stopPropagation())

    await act(async () => child?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })))

    expect(useChatStore.getState().artifactsPanelOpen).toBe(false)
  })

  it('keeps the panel open while Escape belongs to an IME composition', async () => {
    await renderPanel()

    await dispatchKeyDown(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: 'Escape'
    }))

    expect(useChatStore.getState().artifactsPanelOpen).toBe(true)

    const legacyImeEscape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })
    Object.defineProperty(legacyImeEscape, 'keyCode', { value: 229 })
    await dispatchKeyDown(legacyImeEscape)

    expect(useChatStore.getState().artifactsPanelOpen).toBe(true)
  })

  it('keeps the panel open for other keys', async () => {
    await renderPanel()

    await dispatchKeyDown(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }))

    expect(useChatStore.getState().artifactsPanelOpen).toBe(true)
  })

  it('removes the Escape listener when the panel unmounts', async () => {
    await renderPanel()
    await act(async () => root.unmount())
    rootIsMounted = false

    useChatStore.setState({ artifactsPanelOpen: true })
    await dispatchKeyDown(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    }))

    expect(useChatStore.getState().artifactsPanelOpen).toBe(true)
  })
})
