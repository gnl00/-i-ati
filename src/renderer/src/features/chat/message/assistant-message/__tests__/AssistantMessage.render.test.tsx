// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { ChatForkInProgressError } from '@renderer/features/chat/state/chatCoordinatorStore'
import { useToolConfirmationStore } from '@renderer/features/chat/state/toolConfirmationStore'

const toolCallRenderCounts = new Map<string, number>()
let headerRenderCount = 0
let latestModelBadgeProps: Record<string, unknown> | null = null
type BranchOperationCapture = {
  showBranch?: boolean
  onBranchClick?: () => void
}
const branchOperationCapture = vi.hoisted(() => ({
  props: null as BranchOperationCapture | null
}))
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn()
}))

vi.mock('sonner', () => ({ toast: toastMocks }))

vi.mock('@renderer/features/chat/runtime/useChatRun', () => ({
  default: () => ({
    onSubmit: vi.fn()
  })
}))

vi.mock('@renderer/infrastructure/config/appConfig', async () => {
  const { create } = await import('zustand')

  const useAppConfigStore = create(() => ({
    providerDefinitions: [],
    accounts: []
  }))

  return {
    useAppConfigStore
  }
})

vi.mock('../../message-operations', () => ({
  MessageOperations: (props: BranchOperationCapture) => {
    branchOperationCapture.props = props
    return null
  }
}))

vi.mock('../error-message', () => ({
  ErrorMessage: () => null
}))

vi.mock('../CommandConfirmation', () => ({
  CommandConfirmation: () => null
}))

vi.mock('../model-badge/ModelBadge', () => ({
  ModelBadge: (props: Record<string, unknown>) => {
    headerRenderCount += 1
    latestModelBadgeProps = props
    return null
  }
}))

vi.mock('../segments/TextSegment', () => ({
  TextSegment: ({
    segment,
    visibleText,
    animateOnMount
  }: {
    segment: TextSegment
    visibleText?: string
    animateOnMount?: boolean
  }) => (
    <div
      data-testid={`text-${segment.segmentId}`}
      data-animate-mount={animateOnMount === false ? 'no' : 'yes'}
    >
      {visibleText ?? segment.content}
    </div>
  )
}))

vi.mock('../segments/ReasoningSegment', () => ({
  ReasoningSegment: ({ segment }: { segment: ReasoningSegment }) => (
    <div data-testid={`reasoning-${segment.segmentId}`}>{segment.content}</div>
  )
}))

vi.mock('../typewriter/StreamingMarkdownSwitch', () => ({
  StreamingMarkdownSwitch: ({ text, visibleText }: { text: string; visibleText?: string }) => (
    <div data-testid="streaming-markdown">{visibleText ?? text}</div>
  )
}))

vi.mock('../toolcall/ToolCallResult', async () => {
  const React = await import('react')

  const ToolCallResult = React.memo(({
    toolCall
  }: {
    toolCall: ToolCallSegment
    index: number
  }) => {
    const key = toolCall.segmentId
    toolCallRenderCounts.set(key, (toolCallRenderCounts.get(key) ?? 0) + 1)
    return <div data-testid={`tool-${toolCall.toolCallId}`}>{toolCall.name}</div>
  })

  const ToolCallTriggerContent = ({
    toolCall
  }: {
    toolCall: ToolCallSegment
  }) => {
    const key = toolCall.segmentId
    toolCallRenderCounts.set(key, (toolCallRenderCounts.get(key) ?? 0) + 1)
    return <span>{toolCall.name}</span>
  }

  return {
    ToolCallResult,
    ToolCallTriggerContent,
    getToolCallTriggerButtonClassName: () => 'tool-call-trigger-button',
    getNormalizedStatus: (status: unknown) => typeof status === 'string' ? status.toLowerCase() : undefined,
    getToolCallHeaderState: (segment: ToolCallSegment) => {
      const status = typeof segment.content?.status === 'string' ? segment.content.status.toLowerCase() : undefined
      const isError = Boolean(segment.isError) || status === 'error' || status === 'failed'
      const isPending = !isError && status === 'pending'
      const isRunning = !isError && status === 'running'
      return {
        toolResponse: segment.content,
        status,
        isError,
        isPending,
        isRunning,
        statusLabel: isError ? 'failed' : isRunning ? 'running' : isPending ? 'pending' : 'completed',
        tone: isError ? 'danger' : isRunning || isPending ? 'warning' : 'success'
      }
    },
    getToolCallTriggerAriaLabel: (name: string, statusLabel: string) => (
      `Inspect ${name} tool call, status ${statusLabel}`
    ),
    areToolCallSegmentsEqual: (previous: ToolCallSegment, next: ToolCallSegment) => previous === next
  }
})

import { AssistantMessage } from '../index'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'

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
  reason?: string
}): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: args.id,
  name: args.name ?? 'read',
  content: {
    toolName: args.name ?? 'read',
    args: JSON.stringify({
      path: 'README.md',
      ...(args.reason ? { tool_call_reason: args.reason } : {})
    }),
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
  headerRenderCount = 0
  latestModelBadgeProps = null
  branchOperationCapture.props = null
  toastMocks.success.mockReset()
  toastMocks.warning.mockReset()
  toastMocks.error.mockReset()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

    useChatStore.setState({
      runPhase: 'streaming',
      messages: [],
      currentChatUuid: null,
      pendingUserMessage: null,
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
            committedMessage={message}
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

  it('keeps non-latest historical code opaque during another response', async () => {
    const code = '```ts\\nconst answer = 1\\n```'
    const segment = textSegment('committed:history:code:0', code)

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          committedMessage={createAssistantMessage([segment], code)}
          isLatest={false}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    const rendered = container.querySelector('[data-testid="text-committed:history:code:0"]')
    expect(rendered?.getAttribute('data-animate-mount')).toBe('no')
    expect(container.querySelector('#assistant-message-0')?.className)
      .not.toContain('animate-assistant-message-in')
  })

  it('keeps a previous latest assistant historical when a new user turn starts', async () => {
    const code = '```ts\\nconst answer = 1\\n```'
    const historicalUser: MessageEntity = {
      id: 10,
      body: {
        role: 'user',
        content: 'Previous question',
        segments: []
      }
    }
    const historicalAssistant: MessageEntity = {
      id: 11,
      body: {
        role: 'assistant',
        content: code,
        segments: [textSegment('committed:history:latest:code:0', code)],
        typewriterCompleted: false
      }
    }

    useChatStore.setState({
      runPhase: 'idle',
      messages: [historicalUser, historicalAssistant],
      currentChatUuid: 'chat-1',
      pendingUserMessage: null
    })

    await act(async () => {
      root.render(
        <AssistantMessage
          index={1}
          messageId={11}
          committedMessage={historicalAssistant.body}
          isLatest
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    const assertHistoryPresentation = () => {
      const rendered = container.querySelector('[data-testid="text-committed:history:latest:code:0"]')
      expect(rendered?.getAttribute('data-animate-mount')).toBe('no')
      expect(container.querySelector('#assistant-message-1')?.className)
        .not.toContain('animate-assistant-message-in')
    }
    assertHistoryPresentation()

    await act(async () => {
      useChatStore.setState({
        runPhase: 'submitting',
        pendingUserMessage: {
          submissionId: 'submission-1',
          chatUuid: 'chat-1',
          text: 'New question',
          mediaCtx: [],
          createdAt: 2
        }
      })
    })
    assertHistoryPresentation()

    await act(async () => {
      useChatStore.setState({ runPhase: 'streaming' })
    })
    assertHistoryPresentation()

    const newUser: MessageEntity = {
      id: 12,
      body: {
        role: 'user',
        content: 'New question',
        segments: []
      }
    }
    await act(async () => {
      useChatStore.setState({
        messages: [historicalUser, historicalAssistant, newUser],
        runPhase: 'submitting',
        pendingUserMessage: null
      })
    })
    assertHistoryPresentation()

    await act(async () => {
      useChatStore.setState({ runPhase: 'streaming' })
    })
    assertHistoryPresentation()
  })

  it('keeps live presentation playback enabled after the run settles', async () => {
    const liveContent = '```ts\\nconst answer = 1\\n```'
    const segment = textSegment('committed:live:text:0', liveContent)
    const message: ChatMessage = {
      ...createAssistantMessage([segment], liveContent),
      typewriterCompleted: true
    }

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          committedMessage={message}
          isLatest
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    const renderedBeforeSettling = container.querySelector('[data-testid="text-committed:live:text:0"]')
    expect(renderedBeforeSettling?.getAttribute('data-animate-mount')).toBe('yes')

    await act(async () => {
      useChatStore.setState({ runPhase: 'idle' })
    })

    const renderedAfterSettling = container.querySelector('[data-testid="text-committed:live:text:0"]')
    expect(renderedAfterSettling?.getAttribute('data-animate-mount')).toBe('yes')
  })

  it('forks from the persisted assistant message and reports success', async () => {
    const forkCurrentChatFromMessage = vi.fn().mockResolvedValue({})
    useChatStore.setState({
      runPhase: 'idle',
      forkCurrentChatFromMessage
    })

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          messageId={42}
          committedMessage={{
            ...createAssistantMessage([
              textSegment('committed:step-1:text:0', 'answer')
            ], 'answer'),
            typewriterCompleted: true
          }}
          isLatest
          isHovered
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    expect(branchOperationCapture.props?.showBranch).toBe(true)
    act(() => {
      branchOperationCapture.props?.onBranchClick?.()
    })

    await vi.waitFor(() => {
      expect(forkCurrentChatFromMessage).toHaveBeenCalledWith(42)
      expect(toastMocks.success).toHaveBeenCalledWith('Chat branch created')
    })
  })

  it('keeps the source selected when branch creation fails or a run is active', async () => {
    const forkCurrentChatFromMessage = vi.fn().mockRejectedValue(new Error('fork failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    useChatStore.setState({
      runPhase: 'idle',
      forkCurrentChatFromMessage
    })

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          messageId={42}
          committedMessage={{
            ...createAssistantMessage([
              textSegment('committed:step-1:text:0', 'answer')
            ], 'answer'),
            typewriterCompleted: true
          }}
          isLatest
          isHovered
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    act(() => {
      branchOperationCapture.props?.onBranchClick?.()
    })
    await vi.waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith('Failed to create chat branch')
    })

    forkCurrentChatFromMessage.mockClear()
    await act(async () => {
      useChatStore.setState({ runPhase: 'streaming' })
    })
    act(() => {
      branchOperationCapture.props?.onBranchClick?.()
    })

    expect(forkCurrentChatFromMessage).not.toHaveBeenCalled()
    expect(toastMocks.warning).toHaveBeenCalledWith('Please wait for current response to finish')
    consoleError.mockRestore()
  })

  it('reports a concurrent branch request as pending work', async () => {
    const forkCurrentChatFromMessage = vi.fn().mockRejectedValue(new ChatForkInProgressError())
    useChatStore.setState({
      runPhase: 'idle',
      forkCurrentChatFromMessage
    })

    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          messageId={42}
          committedMessage={{
            ...createAssistantMessage([
              textSegment('committed:step-1:text:0', 'answer')
            ], 'answer'),
            typewriterCompleted: true
          }}
          isLatest
          isHovered
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    act(() => {
      branchOperationCapture.props?.onBranchClick?.()
    })

    await vi.waitFor(() => {
      expect(toastMocks.warning).toHaveBeenCalledWith('Chat branch creation is already in progress')
      expect(toastMocks.error).not.toHaveBeenCalled()
    })
  })

  it('does not rerender the header subtree when only text changes', async () => {
    const renderMessage = async (message: ChatMessage) => {
      await act(async () => {
        root.render(
          <AssistantMessage
            index={0}
            committedMessage={message}
            isLatest={true}
            isHovered={false}
            onHover={() => {}}
            onCopyClick={() => {}}
          />
        )
      })
    }

    await renderMessage({
      ...createAssistantMessage([
        textSegment('committed:step-1:text:0', 'hello')
      ], 'hello'),
      model: 'gpt-5'
    })

    expect(headerRenderCount).toBe(1)

    await renderMessage({
      ...createAssistantMessage([
        textSegment('committed:step-1:text:0', 'hello world')
      ], 'hello world'),
      model: 'gpt-5'
    })

    await renderMessage({
      ...createAssistantMessage([
        textSegment('committed:step-1:text:0', 'hello world again')
      ], 'hello world again'),
      model: 'gpt-5'
    })

    expect(headerRenderCount).toBe(1)
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
          committedMessage={createAssistantMessage([
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
          committedMessage={createAssistantMessage([
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
          committedMessage={createAssistantMessage([
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
          committedMessage={{
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

  it('renders a pending model header before committed assistant content exists', async () => {
    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          pendingModel={{
            model: 'gpt-5',
            modelRef: {
              accountId: 'openai',
              modelId: 'gpt-5'
            }
          }}
          isLatest={true}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    expect(headerRenderCount).toBe(1)
  })

  it('does not rerender the pending header when preview text changes', async () => {
    const pendingModel = {
      model: 'gpt-5',
      modelRef: {
        accountId: 'openai',
        modelId: 'gpt-5'
      }
    }

    const renderPending = async (previewMessage?: ChatMessage) => {
      await act(async () => {
        root.render(
          <AssistantMessage
            index={0}
            pendingModel={pendingModel}
            previewMessage={previewMessage}
            isLatest={true}
            isHovered={false}
            onHover={() => {}}
            onCopyClick={() => {}}
          />
        )
      })
    }

    await renderPending()

    expect(headerRenderCount).toBe(1)

    await renderPending({
      ...createAssistantMessage([
        textSegment('preview:step-1:text:0', 'hello')
      ], 'hello'),
      source: 'stream_preview',
      model: 'gpt-5',
      modelRef: pendingModel.modelRef
    })

    await renderPending({
      ...createAssistantMessage([
        textSegment('preview:step-1:text:0', 'hello world')
      ], 'hello world'),
      source: 'stream_preview',
      model: 'gpt-5',
      modelRef: pendingModel.modelRef
    })

    expect(headerRenderCount).toBe(1)
  })

  it('keeps tool call reason props out of the model badge', async () => {
    await act(async () => {
      root.render(
        <AssistantMessage
          index={0}
          committedMessage={{
            ...createAssistantMessage([
              toolCallSegment({
                id: 'committed:step-1:tool:tool-1',
                toolCallId: 'tool-1',
                reason: 'Inspect the current layout implementation.'
              })
            ], ''),
            model: 'gpt-5'
          }}
          isLatest={true}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    expect(latestModelBadgeProps).toMatchObject({
      model: 'gpt-5',
      provider: undefined
    })
    expect(latestModelBadgeProps).not.toHaveProperty('toolCallReason')
    expect(latestModelBadgeProps).not.toHaveProperty('toolCallReasons')
  })
})
