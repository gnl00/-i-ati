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

  const renderActions = (runPhase: RunPhase = 'idle', variant: 'default' | 'baseline' | 'surface' = 'default'): void => {
    root.render(
      <Profiler id="ChatInputActions" onRender={() => { commitCount += 1 }}>
        <ChatInputActions
          runPhase={runPhase}
          variant={variant}
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

  for (const variant of ['default', 'baseline', 'surface'] as const) {
    it.each([
      ['./workspaces/chat-1', 'tmp'],
      ['/app/workspaces/chat-1/', 'tmp'],
      ['C:\\app\\workspaces\\chat-1\\', 'tmp'],
      ['./workspaces/tmp', 'tmp'],
      ['workspaces/chat-1', 'tmp'],
      ['/projects/chat-1', 'chat-1'],
      ['/projects/myworkspaces/chat-1', 'chat-1'],
      ['./workspaces/chat-2', 'chat-2'],
      ['./workspaces/824b14dc-e1f8-44d8-9d11-c1dafb39fe7d', 'tmp'],
      ['/app/workspaces/824b14dc-e1f8-44d8-9d11-c1dafb39fe7d/', 'tmp'],
      ['C:\\app\\workspaces\\824b14dc-e1f8-44d8-9d11-c1dafb39fe7d\\', 'tmp'],
      ['/projects/824b14dc-e1f8-44d8-9d11-c1dafb39fe7d', '824b14dc-e1f8-44d8-9d11-c1dafb39fe7d'],
      ['/projects/myworkspaces/824b14dc-e1f8-44d8-9d11-c1dafb39fe7d', '824b14dc-e1f8-44d8-9d11-c1dafb39fe7d'],
      ['/projects/example/', 'example'],
      [undefined, 'Workspace']
    ])(`shows the workspace label for %s in ${variant}`, async (workspacePath, label) => {
      useChatStore.setState({
        chatList: [{
          id: 1,
          uuid: 'chat-1',
          title: 'Chat 1',
          messages: [],
          workspacePath,
          createTime: 1,
          updateTime: 1
        }]
      })
      await act(async () => {
        renderActions('idle', variant)
      })
      const button = Array.from(container.querySelectorAll('button')).find(button =>
        button.textContent?.trim() === label
      )
      expect(button).toBeDefined()
    })
  }

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
