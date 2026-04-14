// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@renderer/store/chatStore'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'

const toolCallRenderCounts = new Map<string, number>()

vi.mock('@renderer/hooks/useChatRun', () => ({
  default: () => ({
    onSubmit: vi.fn()
  })
}))

vi.mock('@renderer/store/appConfig', async () => {
  const { create } = await import('zustand')

  const useAppConfigStore = create(() => ({
    providerDefinitions: [],
    accounts: []
  }))

  return {
    useAppConfigStore
  }
})

vi.mock('../message-operations', () => ({
  MessageOperations: () => null
}))

vi.mock('../error-message', () => ({
  ErrorMessage: () => null
}))

vi.mock('../CommandConfirmation', () => ({
  CommandConfirmation: () => null
}))

vi.mock('../model-badge/ModelBadgeNext', () => ({
  ModelBadgeNext: () => null
}))

vi.mock('../segments/TextSegment', () => ({
  TextSegment: ({ segment, visibleText }: { segment: TextSegment; visibleText?: string }) => (
    <div data-testid={`text-${segment.segmentId}`}>{visibleText ?? segment.content}</div>
  )
}))

vi.mock('../segments/ReasoningSegmentNext', () => ({
  ReasoningSegmentNext: ({ segment }: { segment: ReasoningSegment }) => (
    <div data-testid={`reasoning-${segment.segmentId}`}>{segment.content}</div>
  )
}))

vi.mock('../typewriter/StreamingMarkdownSwitch', () => ({
  StreamingMarkdownSwitch: ({ text, visibleTokens }: { text: string; visibleTokens?: string[] }) => (
    <div data-testid="streaming-markdown">{visibleTokens ? visibleTokens.join('') : text}</div>
  )
}))

vi.mock('../toolcall/ToolCallResultNextOutput', async () => {
  const React = await import('react')

  const ToolCallResultNextOutput = React.memo(({
    toolCall
  }: {
    toolCall: ToolCallSegment
    index: number
  }) => {
    const key = toolCall.segmentId
    toolCallRenderCounts.set(key, (toolCallRenderCounts.get(key) ?? 0) + 1)
    return <div data-testid={`tool-${toolCall.toolCallId}`}>{toolCall.name}</div>
  })

  return {
    ToolCallResultNextOutput
  }
})

import { AssistantMessage } from '../index'
import { useAppConfigStore } from '@renderer/store/appConfig'

const textSegment = (id: string, content: string, timestamp = 1): TextSegment => ({
  type: 'text',
  segmentId: id,
  content,
  timestamp
})

const toolCallSegment = (args: {
  id: string
  toolCallId: string
  name?: string
  status?: string
  timestamp?: number
}): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: args.id,
  name: args.name ?? 'read',
  content: {
    toolName: args.name ?? 'read',
    args: '{"path":"README.md"}',
    status: args.status ?? 'pending'
  },
  isError: false,
  timestamp: args.timestamp ?? 2,
  toolCallId: args.toolCallId,
  toolCallIndex: 0
})

const createAssistantMessage = (segments: MessageSegment[], content: string): ChatMessage => ({
  role: 'assistant',
  content,
  segments,
  typewriterCompleted: false
})

describe('AssistantMessage render isolation', () => {
  let container: HTMLDivElement
  let root: Root

beforeEach(() => {
  toolCallRenderCounts.clear()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

    useChatStore.setState({
      runPhase: 'streaming',
      messages: [],
      selectedModelRef: undefined
    })
    useToolConfirmationStore.setState({
      pendingRequests: []
    })
    useAppConfigStore.setState({
      providerDefinitions: [],
      accounts: []
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('does not rerender the toolcall subtree when only text changes', async () => {
    const stableToolSegment = toolCallSegment({
      id: 'committed:step-1:tool:tool-1',
      toolCallId: 'tool-1'
    })

    const renderMessage = async (message: ChatMessage) => {
      await act(async () => {
        root.render(
          <AssistantMessage
            index={0}
            message={message}
            isLatest={true}
            isHovered={false}
            onHover={() => {}}
            onCopyClick={() => {}}
          />
        )
      })
    }

    await renderMessage(createAssistantMessage([
      textSegment('committed:step-1:text:0', 'hello'),
      stableToolSegment
    ], 'hello'))

    expect(toolCallRenderCounts.get('committed:step-1:tool:tool-1')).toBe(1)

    await renderMessage(createAssistantMessage([
      textSegment('committed:step-1:text:0', 'hello world'),
      stableToolSegment
    ], 'hello world'))

    await renderMessage(createAssistantMessage([
      textSegment('committed:step-1:text:0', 'hello world again'),
      stableToolSegment
    ], 'hello world again'))

    expect(toolCallRenderCounts.get('committed:step-1:tool:tool-1')).toBe(1)
  })

  it('rerenders the toolcall subtree when the tool segment itself changes', async () => {
    const pendingToolSegment = toolCallSegment({
      id: 'committed:step-1:tool:tool-1',
      toolCallId: 'tool-1',
      status: 'pending'
    })

    const runningToolSegment = toolCallSegment({
      id: 'committed:step-1:tool:tool-1',
      toolCallId: 'tool-1',
      status: 'running'
    })

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          message={createAssistantMessage([
            textSegment('committed:step-1:text:0', 'hello'),
            pendingToolSegment
          ], 'hello')}
          isLatest={true}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    expect(toolCallRenderCounts.get('committed:step-1:tool:tool-1')).toBe(1)

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          message={createAssistantMessage([
            textSegment('committed:step-1:text:0', 'hello world'),
            runningToolSegment
          ], 'hello world')}
          isLatest={true}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    expect(toolCallRenderCounts.get('committed:step-1:tool:tool-1')).toBe(2)
  })

  it('does not break hook ordering when rerendered with a non-assistant message', async () => {
    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          message={createAssistantMessage([
            textSegment('committed:step-1:text:0', 'hello')
          ], 'hello')}
          isLatest={true}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          message={{
            role: 'user',
            content: 'user message',
            segments: []
          }}
          isLatest={false}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    expect(container.innerHTML).toBe('')
  })
})
