import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '../chatStore'

describe('chat view state', () => {
  beforeEach(() => {
    useChatStore.setState({
      artifactsPanelOpen: false,
      artifactsActiveTab: 'stats',
      toolCallInspectorSelection: null
    })
  })

  it('selects a tool call while preserving the Artifacts panel state', () => {
    useChatStore.setState({
      artifactsPanelOpen: false,
      artifactsActiveTab: 'files'
    })
    const selection = {
      chatUuid: 'chat-1',
      segmentId: 'segment-1',
      toolCallId: 'tool-1'
    }

    useChatStore.getState().selectToolCall(selection)

    expect(useChatStore.getState()).toMatchObject({
      artifactsPanelOpen: false,
      artifactsActiveTab: 'files',
      toolCallInspectorSelection: selection
    })
  })

  it('opens the Tools tab and selects a tool call in one update', () => {
    const selection = {
      chatUuid: 'chat-2',
      segmentId: 'segment-2',
      toolCallId: 'tool-2'
    }

    useChatStore.getState().inspectToolCall(selection)

    expect(useChatStore.getState()).toMatchObject({
      artifactsPanelOpen: true,
      artifactsActiveTab: 'tools',
      toolCallInspectorSelection: selection
    })
  })
})
