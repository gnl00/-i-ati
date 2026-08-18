// @vitest-environment happy-dom

import { act, Profiler } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseWorkspaceFilesReturn } from '../useWorkspaceFiles'

const workspaceFilesMock = vi.hoisted(() => vi.fn<() => UseWorkspaceFilesReturn>(() => ({
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
  FilesTabToolbar: () => <div data-testid="files-toolbar">Files toolbar</div>
}))

vi.mock('../ArtifactsFooter', () => ({
  ArtifactsFooter: () => <div data-testid="artifacts-footer">Workspace footer</div>
}))

vi.mock('@renderer/features/chat', async () => {
  const actual = await vi.importActual<typeof import('@renderer/features/chat')>('@renderer/features/chat')
  return {
    ...actual,
    ChatStatsPanel: () => <div>Overview content</div>
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
    workspaceFilesMock.mockReset()
    workspaceFilesMock.mockReturnValue({
      workspaceTree: [],
      selectedFilePath: undefined,
      selectedFileContent: undefined,
      selectedFileName: undefined,
      workspacePath: '/workspace',
      isLoadingTree: false,
      isLoadingFile: false,
      handleFileSelect: vi.fn(),
      handleRefresh: vi.fn()
    })
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

    const renderCountAfterPreview = workspaceFilesMock.mock.calls.length
    expect(renderCountAfterPreview).toBeGreaterThan(0)
    expect(container.querySelector('[role="tabpanel"][data-state="active"]')?.textContent)
      .toContain('Preview content')
    expect(container.querySelector('[data-testid="artifacts-footer"]')).toBeTruthy()

    await act(async () => useChatStore.getState().setArtifactsActiveTab('tools'))

    expect(workspaceFilesMock).toHaveBeenCalledTimes(renderCountAfterPreview + 1)
    expect(container.querySelector('[data-testid="preview-content"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="artifacts-footer"]')).toBeNull()
  })

  it('shows the Files toolbar only when the workspace contains files', async () => {
    useChatStore.setState({ artifactsActiveTab: 'files' })
    await renderPanel()

    expect(container.querySelector('[data-testid="files-content"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="files-toolbar"]')).toBeNull()

    workspaceFilesMock.mockReturnValue({
      workspaceTree: [{
        name: 'README.md',
        path: '/workspace/README.md',
        type: 'file'
      }],
      selectedFilePath: undefined,
      selectedFileContent: undefined,
      selectedFileName: undefined,
      workspacePath: '/workspace',
      isLoadingTree: false,
      isLoadingFile: false,
      handleFileSelect: vi.fn(),
      handleRefresh: vi.fn()
    })
    await act(async () => root.render(<ArtifactsPanel />))

    expect(container.querySelector('[data-testid="files-toolbar"]')).toBeTruthy()
  })

  it('keeps tab geometry compact and exposes a visible keyboard focus treatment', async () => {
    await renderPanel()

    const tabsList = container.querySelector<HTMLElement>('[role="tablist"]')
    const tabsHeader = tabsList?.parentElement
    const toolsTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find(tab => tab.textContent === 'Tools')
    const toolsPanel = container.querySelector<HTMLElement>(
      '[role="tabpanel"][data-state="active"]'
    )

    expect(tabsHeader?.className).toContain('h-8')
    expect(tabsHeader?.className).toContain('items-center')
    expect(tabsList?.className).toContain('h-fit')
    expect(tabsList?.className).toContain('self-center')
    expect(tabsList?.className).toContain('gap-1')
    expect(tabsList?.className).not.toContain('h-full')
    expect(tabsList?.className).not.toContain('gap-4')
    expect(toolsTab?.className).toContain('h-6')
    expect(toolsTab?.className).toContain('min-w-14')
    expect(toolsTab?.className).toContain('px-2')
    expect(toolsTab?.className).not.toContain('h-full')
    expect(toolsTab?.className).toContain('focus-visible:ring-2')
    expect(toolsPanel?.className).not.toContain('animate-in')
    const tabLabels = Array.from(container.querySelectorAll('[role="tab"]'))
      .map(tab => tab.textContent)
    expect(tabLabels).toEqual(['Overview', 'Tools', 'Preview', 'Files'])
    expect(container.querySelector(
      'button[aria-label="Close artifacts"]'
    )).toBeNull()
  })

  it('shows the workspace content in the first committed frame after activation', async () => {
    const committedActivePanels: string[] = []

    await act(async () => root.render(
      <Profiler
        id="artifacts-panel"
        onRender={() => {
          committedActivePanels.push(
            container.querySelector<HTMLElement>(
              '[role="tabpanel"][data-state="active"]'
            )?.textContent ?? ''
          )
        }}
      >
        <ArtifactsPanel />
      </Profiler>
    ))
    rootIsMounted = true

    committedActivePanels.length = 0
    await act(async () => useChatStore.getState().setArtifactsActiveTab('preview'))

    expect(committedActivePanels[0]).toContain('Preview content')
  })

  it('keeps top-level tab transitions animation-free', async () => {
    await renderPanel()

    await act(async () => useChatStore.getState().setArtifactsActiveTab('preview'))
    const previewPanel = container.querySelector<HTMLElement>(
      '[role="tabpanel"][data-state="active"]'
    )
    expect(previewPanel?.className).not.toContain('animate-in')
    expect(previewPanel?.className).not.toContain('fade-in')
    expect(previewPanel?.className).not.toContain('duration-300')

    await act(async () => useChatStore.getState().setArtifactsActiveTab('files'))
    const filesPanel = container.querySelector<HTMLElement>(
      '[role="tabpanel"][data-state="active"]'
    )
    expect(filesPanel?.textContent).toContain('Files content')
    expect(filesPanel?.className).not.toContain('animate-in')
    expect(filesPanel?.className).not.toContain('fade-in')
    expect(filesPanel?.className).not.toContain('duration-300')

    await act(async () => useChatStore.getState().setArtifactsActiveTab('stats'))
    const statsPanel = container.querySelector<HTMLElement>(
      '[role="tabpanel"][data-state="active"]'
    )
    expect(statsPanel?.className).not.toContain('animate-in')
    expect(statsPanel?.className).not.toContain('fade-in')
    expect(statsPanel?.className).not.toContain('duration-300')

    await act(async () => useChatStore.getState().setArtifactsActiveTab('tools'))
    const toolsPanel = container.querySelector<HTMLElement>(
      '[role="tabpanel"][data-state="active"]'
    )
    const toolsEmptyState = container.querySelector<HTMLElement>(
      '[data-testid="tool-inspector-empty"]'
    )
    expect(toolsPanel?.className).not.toContain('animate-in')
    expect(toolsEmptyState?.className).toContain('animate-in')
    expect(toolsEmptyState?.className).toContain('fade-in')
  })

  it('centers the Tools empty state within the available content area', async () => {
    await renderPanel()

    const emptyState = container.querySelector<HTMLElement>(
      '[data-testid="tool-inspector-empty"]'
    )

    expect(emptyState?.className).toContain('h-full')
    expect(emptyState?.className).toContain('items-center')
    expect(emptyState?.className).toContain('justify-center')
    expect(emptyState?.className).toContain('animate-in')
    expect(emptyState?.className).toContain('fade-in')
    expect(emptyState?.className).toContain('slide-in-from-bottom-4')
    expect(emptyState?.className).toContain('duration-200')
    expect(emptyState?.className).toContain(
      '[animation-timing-function:cubic-bezier(0.23,1,0.32,1)]'
    )
    expect(emptyState?.className).toContain('motion-reduce:slide-in-from-bottom-0')

    const emptyStateIcon = container.querySelector<HTMLElement>(
      '[data-testid="tool-inspector-empty-icon"]'
    )
    expect(emptyStateIcon?.className).toContain('h-14')
    expect(emptyStateIcon?.className).toContain('w-14')
    expect(emptyStateIcon?.className).toContain('rounded-2xl')
    expect(emptyStateIcon?.className).toContain('bg-zinc-100/60')
    expect(emptyStateIcon?.className).toContain('shadow-xs')
    expect(emptyStateIcon?.querySelector('svg')?.getAttribute('class')).toContain('h-10')
  })

  it('leaves Escape ownership to the surrounding side-panel layout', async () => {
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
    expect(state.artifactsPanelOpen).toBe(true)
    expect(state.artifactsActiveTab).toBe('tools')
    expect(state.toolCallInspectorSelection).toEqual(selection)
  })
})
