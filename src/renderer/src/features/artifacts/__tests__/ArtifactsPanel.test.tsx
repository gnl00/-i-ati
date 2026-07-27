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

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    workspaceFilesMock.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useChatStore.setState({
      currentChatUuid: 'chat-1',
      artifactsPanelOpen: true,
      artifactsActiveTab: 'tools',
      toolCallInspectorSelection: null
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('delays workspace loading until Preview or Files is opened and keeps it mounted', async () => {
    await act(async () => root.render(<ArtifactsPanel />))
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
    await act(async () => root.render(<ArtifactsPanel />))

    const toolsTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find(tab => tab.textContent === 'Tools')
    const toolsPanel = container.querySelector<HTMLElement>(
      '[role="tabpanel"][data-state="active"]'
    )

    expect(toolsTab?.className).toContain('min-w-12')
    expect(toolsTab?.className).toContain('focus-visible:ring-2')
    expect(toolsPanel?.className).not.toContain('animate-in')
  })
})
