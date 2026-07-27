// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useChatStore } from '@renderer/features/chat'
import { FloatingArtifactsToggle } from '../FloatingArtifactsToggle'

describe('FloatingArtifactsToggle', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useChatStore.setState({
      currentChatUuid: 'chat-1',
      artifacts: true,
      artifactsPanelOpen: false,
      artifactsActiveTab: 'stats',
      toolCallInspectorSelection: null
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('opens the Tools tab from the floating pill', async () => {
    await act(async () => root.render(<FloatingArtifactsToggle />))

    const toolsButton = container.querySelector<HTMLButtonElement>('[aria-label="Open Tools"]')
    expect(toolsButton).toBeTruthy()

    await act(async () => toolsButton?.click())

    expect(useChatStore.getState().artifactsActiveTab).toBe('tools')
    expect(useChatStore.getState().artifactsPanelOpen).toBe(true)
  })

  it('follows the artifacts floating-pill lifecycle', async () => {
    useChatStore.setState({
      artifacts: false,
      toolCallInspectorSelection: {
        chatUuid: 'chat-1',
        segmentId: 'segment-1',
        toolCallId: 'tool-call-1'
      }
    })

    await act(async () => root.render(<FloatingArtifactsToggle />))

    expect(container.querySelector('[aria-label="Open Tools"]')).toBeNull()
  })
})
