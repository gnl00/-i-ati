// @vitest-environment happy-dom

import { act, Profiler } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useChatStore, type RunPhase } from '@renderer/features/chat/state/chatStore'
import ChatInputActions from '../ChatInputActions'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const initialChatStoreState = useChatStore.getState()

const createAssistantMessage = (content: string): MessageEntity => ({
  id: 1,
  body: {
    role: 'assistant',
    content,
    segments: []
  }
})

describe('ChatInputActions store subscriptions', () => {
  let container: HTMLDivElement
  let root: Root
  let commitCount: number

  const renderActions = (runPhase: RunPhase = 'idle'): void => {
    root.render(
      <Profiler id="ChatInputActions" onRender={() => { commitCount += 1 }}>
        <ChatInputActions
          runPhase={runPhase}
          onNewChat={() => undefined}
          onSubmit={() => undefined}
        />
      </Profiler>
    )
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    commitCount = 0
    useChatStore.setState({
      messages: [],
      preview: { message: null },
      currentChatId: 1,
      currentChatUuid: 'chat-1',
      chatList: []
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    useChatStore.setState(initialChatStoreState, true)
  })

  it('does not render for preview-only updates', async () => {
    await act(async () => {
      renderActions()
    })
    const initialCommitCount = commitCount

    await act(async () => {
      useChatStore.setState({
        preview: { message: createAssistantMessage('streaming chunk') }
      })
    })

    expect(commitCount).toBe(initialCommitCount)
  })

  it('still renders when message count, chat identity, or chat list changes', async () => {
    await act(async () => {
      renderActions()
    })
    const initialCommitCount = commitCount

    await act(async () => {
      useChatStore.setState({ messages: [createAssistantMessage('answer')] })
    })
    expect(commitCount).toBeGreaterThan(initialCommitCount)

    await act(async () => {
      useChatStore.setState({
        currentChatId: 2,
        currentChatUuid: 'chat-2'
      })
    })
    expect(commitCount).toBeGreaterThan(initialCommitCount)

    await act(async () => {
      useChatStore.setState({
        chatList: [{
          id: 2,
          uuid: 'chat-2',
          title: 'Chat 2',
          messages: [],
          workspacePath: '/tmp/chat-2',
          createTime: 1,
          updateTime: 1
        }]
      })
    })
    expect(commitCount).toBeGreaterThan(initialCommitCount)
  })

  it('renders the stop state when the run phase changes', async () => {
    await act(async () => {
      renderActions()
    })
    const initialCommitCount = commitCount

    await act(async () => {
      renderActions('streaming')
    })

    expect(commitCount).toBeGreaterThan(initialCommitCount)
    expect(container.textContent).toContain('Stop')
  })
})
