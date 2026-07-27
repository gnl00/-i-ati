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

  it('opens the Tools tab and selects a tool call in one update', () => {
    const selection = {
      chatUuid: 'chat-1',
      segmentId: 'segment-1',
      toolCallId: 'tool-1'
    }

    useChatStore.getState().inspectToolCall(selection)

    expect(useChatStore.getState()).toMatchObject({
      artifactsPanelOpen: true,
      artifactsActiveTab: 'tools',
      toolCallInspectorSelection: selection
    })
  })
})
