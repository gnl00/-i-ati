// @vitest-environment happy-dom

import React, { act, forwardRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSheetStore } from '@renderer/features/chat/state/sheetStore'

const testState = vi.hoisted(() => ({
  chatStore: null as any,
  sheetStore: null as any,
  animate: null as any
}))

vi.mock('@renderer/features/artifacts', () => ({
  ArtifactsPanel: () => <div data-testid="artifacts">Artifacts</div>
}))

vi.mock('../ChatHeader', () => ({
  default: () => <div data-testid="chat-header">Header</div>
}))

vi.mock('../ChatSidePanelLayout', () => ({
  default: ({
    children,
    open,
    sidePanel
  }: {
    children: ReactNode
    open?: boolean
    sidePanel?: ReactNode
  }) => <div>{children}{open ? sidePanel : null}</div>
}))

vi.mock('@renderer/features/chat/input/ChatInputArea', () => ({
  default: forwardRef(() => <div data-testid="chat-input">Input</div>)
}))

vi.mock('@renderer/features/chat/input/ChatInputToolConfirmation', () => ({
  ChatInputToolConfirmation: () => null
}))

vi.mock('@renderer/features/chat/input/ChatInputUserQuestion', () => ({
  ChatInputUserQuestion: () => null
}))

vi.mock('../ChatTranscriptScroller', () => ({
  default: ({ displayMessages }: { displayMessages: MessageEntity[] }) => (
    <div data-testid="transcript">
      {displayMessages.map((message) => String(message.body.content)).join('|')}
    </div>
  )
}))

vi.mock('@renderer/features/chat/state/chatStore', async () => {
  const { create } = await import('zustand')
  type MockChatState = {
    messages: MessageEntity[]
    preview: { message: null }
    pendingUserMessage: null
    artifactsPanelOpen: boolean
    currentChatUuid: string | null
    selectionEpoch: number
    scrollHint: { type: 'none' } | Record<string, unknown>
    runPhase: 'idle' | 'submitting' | 'streaming'
    selectedModelRef: undefined
    getSelectionEpoch: () => number
    setArtifactsPanel: ReturnType<typeof vi.fn>
  }
  const useChatStore = create<MockChatState>((_, get) => ({
    messages: [] as MessageEntity[],
    preview: { message: null },
    pendingUserMessage: null,
    artifactsPanelOpen: false,
    currentChatUuid: null,
    selectionEpoch: 1,
    scrollHint: { type: 'none' },
    runPhase: 'idle' as const,
    selectedModelRef: undefined,
    getSelectionEpoch: () => get().selectionEpoch,
    setArtifactsPanel: vi.fn()
  }))
  testState.chatStore = useChatStore
  return { useChatStore }
})

vi.mock('@renderer/features/chat/state/sheetStore', async () => {
  const { create } = await import('zustand')
  const useSheetStore = create((set) => ({
    chatLoading: false,
    chatEntranceRequest: null,
    setChatEntranceRequest: (request: null) => set({ chatEntranceRequest: request })
  }))
  testState.sheetStore = useSheetStore
  return { useSheetStore }
})

vi.mock('@renderer/infrastructure/config/appConfig', async () => {
  const { create } = await import('zustand')
  const useAppConfigStore = create(() => ({
    providersRevision: 0,
    resolveModelRef: () => undefined
  }))
  return { useAppConfigStore }
})

vi.mock('@renderer/shared/lib/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' ')
}))

vi.mock('@renderer/shared/components/ui/resizable', () => ({
  ResizableHandle: () => null,
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: forwardRef<HTMLDivElement, { children?: ReactNode }>(({ children }, ref) => (
      <div ref={ref}>{children}</div>
    ))
  }
}))

vi.mock('../../welcome/SmartWelcomeEntrance', () => ({
  default: () => <div data-testid="welcome">Welcome</div>
}))

vi.mock('../../task/TaskPlanBar', () => ({
  TaskPlanBar: () => null
}))

vi.mock('@renderer/features/task-planner', () => ({
  useTaskPlan: () => ({
    activePlans: [],
    pendingPlanReview: null,
    approvePlanReview: vi.fn(),
    abortPlanReview: vi.fn(),
    refreshPlans: vi.fn()
  })
}))

vi.mock('@renderer/features/subagents', () => ({ useSubagentRuntime: vi.fn() }))
vi.mock('@renderer/features/chat/toolConfirmation/useToolConfirmations', () => ({
  useToolConfirmations: vi.fn()
}))
vi.mock('@renderer/features/chat/toolUserQuestion/useToolUserQuestions', () => ({
  useToolUserQuestions: vi.fn()
}))
vi.mock('@renderer/features/chat/schedule/useScheduleNotifications', () => ({
  useScheduleNotifications: vi.fn()
}))

import ChatWindow from '../ChatWindow'

const createMessage = (
  id: number,
  role: 'user' | 'assistant',
  content: string,
  chatUuid = 'chat-a'
): MessageEntity => ({
  id,
  chatUuid,
  body: {
    role,
    content,
    segments: [],
    typewriterCompleted: true
  }
})

describe('ChatWindow history visibility', () => {
  let container: HTMLDivElement
  let root: Root
  let originalAnimate: unknown
  let originalMatchMedia: unknown
  let rootUnmounted = false

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    testState.chatStore.setState({
      messages: [],
      preview: { message: null },
      pendingUserMessage: null,
      artifactsPanelOpen: false,
      currentChatUuid: null,
      selectionEpoch: 1,
      scrollHint: { type: 'none' },
      runPhase: 'idle',
      selectedModelRef: undefined
    })
    useSheetStore.setState({ chatLoading: false, chatEntranceRequest: null })
    originalAnimate = Element.prototype.animate
    originalMatchMedia = window.matchMedia
    testState.animate = vi.fn(() => ({
      cancel: vi.fn(),
      addEventListener: vi.fn()
    }))
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: testState.animate
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    rootUnmounted = false
  })

  afterEach(async () => {
    if (!rootUnmounted) {
      await act(async () => root.unmount())
    }
    container.remove()
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: originalAnimate
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia
    })
    vi.useRealTimers()
  })

  it('mounts hydrated history directly without the Welcome exit timer', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'user', 'Historical question')]
    })

    await act(async () => root.render(<ChatWindow />))

    expect(container.querySelector('[data-testid="welcome"]')).toBeNull()
    expect(container.querySelector('[data-testid="transcript"]')?.textContent)
      .toBe('Historical question')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the Welcome transition through a newly created chat identity', async () => {
    await act(async () => root.render(<ChatWindow />))

    await act(async () => {
      testState.chatStore.setState({
        runPhase: 'submitting',
        pendingUserMessage: {
          submissionId: 'submission-1',
          chatUuid: null,
          text: 'Fresh question',
          mediaCtx: [],
          createdAt: 1
        }
      })
    })

    expect(vi.getTimerCount()).toBe(1)
    expect(container.querySelector('[data-testid="welcome"]')).toBeTruthy()

    await act(async () => {
      testState.chatStore.setState({ currentChatUuid: 'chat-new' })
    })
    expect(container.querySelector('[data-testid="welcome"]')).toBeTruthy()
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      testState.chatStore.setState({
        messages: [createMessage(-1, 'user', 'Fresh question')],
        pendingUserMessage: null
      })
    })
    await act(async () => vi.advanceTimersByTime(220))

    expect(container.querySelector('[data-testid="welcome"]')).toBeNull()
    expect(container.querySelector('[data-testid="transcript"]')?.textContent)
      .toBe('Fresh question')
  })

  it('cleans the Welcome timer across StrictMode unmount and remount', async () => {
    testState.chatStore.setState({
      runPhase: 'submitting',
      pendingUserMessage: {
        submissionId: 'strict-submission-1',
        chatUuid: null,
        text: 'StrictMode question',
        mediaCtx: [],
        createdAt: 1
      }
    })

    await act(async () => {
      root.render(
        <React.StrictMode>
          <ChatWindow />
        </React.StrictMode>
      )
    })

    expect(vi.getTimerCount()).toBe(1)

    await act(async () => root.unmount())
    expect(vi.getTimerCount()).toBe(0)

    root = createRoot(container)
    await act(async () => {
      root.render(
        <React.StrictMode>
          <ChatWindow />
        </React.StrictMode>
      )
    })

    expect(container.querySelector('[data-testid="welcome"]')).toBeTruthy()
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => vi.advanceTimersByTime(220))
    expect(container.querySelector('[data-testid="welcome"]')).toBeNull()
  })

  it('shows a selected history chat directly when loading invalidates a fresh Welcome', async () => {
    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      testState.chatStore.setState({
        runPhase: 'submitting',
        pendingUserMessage: {
          submissionId: 'selection-race-1',
          chatUuid: null,
          text: 'Fresh question',
          mediaCtx: [],
          createdAt: 1
        }
      })
    })
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      useSheetStore.setState({ chatLoading: true })
    })
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => {
      testState.chatStore.setState({
        currentChatUuid: 'chat-history',
        messages: [createMessage(7, 'assistant', 'Loaded history', 'chat-history')],
        runPhase: 'idle',
        scrollHint: {
          type: 'conversation-switch',
          chatUuid: 'chat-history',
          index: 0,
          align: 'end'
        }
      })
      useSheetStore.setState({ chatLoading: false })
    })

    expect(container.querySelector('[data-testid="welcome"]')).toBeNull()
    expect(container.querySelector('[data-testid="transcript"]')?.textContent)
      .toBe('Loaded history')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('invalidates the Welcome timer when a new chat resets before completion', async () => {
    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      testState.chatStore.setState({
        runPhase: 'submitting',
        pendingUserMessage: {
          submissionId: 'submission-1',
          chatUuid: null,
          text: 'Discarded question',
          mediaCtx: [],
          createdAt: 1
        }
      })
    })
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      testState.chatStore.setState({
        runPhase: 'idle',
        currentChatUuid: null,
        messages: [],
        pendingUserMessage: null
      })
    })
    await act(async () => vi.advanceTimersByTime(220))

    expect(container.querySelector('[data-testid="welcome"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="transcript"]')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the current transcript visible while a chat selection is loading', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Current answer')]
    })

    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      useSheetStore.setState({ chatLoading: true })
    })

    expect(container.querySelector('[data-testid="transcript"]')?.textContent)
      .toBe('Current answer')
    expect(container.querySelector('[data-testid="chat-loading-indicator"]'))
      .toMatchObject({
        getAttribute: expect.any(Function)
      })
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-live'))
      .toBe('polite')

    await act(async () => {
      useSheetStore.setState({ chatLoading: false })
    })
    expect(container.querySelector('[data-testid="chat-loading-indicator"]')).toBeNull()
  })

  it('animates the mounted history surface once for a matching pointer selection', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Historical answer')]
    })

    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      useSheetStore.setState({
        chatLoading: false,
        chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
      })
    })

    expect(testState.animate).toHaveBeenCalledTimes(1)
    const surface = container.querySelector('[data-testid="chat-transcript-entrance-surface"]')
    expect(surface?.querySelector('[data-testid="transcript"]')).toBeTruthy()
    expect(testState.animate).toHaveBeenCalledWith(
      [{ opacity: 0.6 }, { opacity: 1 }],
      { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
    expect(testState.animate.mock.results[0]?.value.addEventListener)
      .toHaveBeenCalledWith('finish', expect.any(Function), { once: true })
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()

    await act(async () => {
      testState.chatStore.setState({
        messages: [createMessage(1, 'assistant', 'Historical answer updated')]
      })
    })
    expect(testState.animate).toHaveBeenCalledTimes(1)
  })

  it('keeps the transcript and surrounding shell nodes stable while content updates', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Historical answer')],
      artifactsPanelOpen: true
    })

    await act(async () => root.render(<ChatWindow />))

    const surface = container.querySelector('[data-testid="chat-transcript-entrance-surface"]')
    const transcript = surface?.querySelector('[data-testid="transcript"]') as HTMLDivElement | null
    const header = container.querySelector('[data-testid="chat-header"]')
    const composer = container.querySelector('[data-testid="chat-input"]')
    const artifacts = container.querySelector('[data-testid="artifacts"]')
    expect(surface).toBeTruthy()
    expect(transcript).toBeTruthy()
    expect(header).toBeTruthy()
    expect(composer).toBeTruthy()
    expect(artifacts).toBeTruthy()
    expect(surface?.contains(header)).toBe(false)
    expect(surface?.contains(composer)).toBe(false)
    expect(surface?.contains(artifacts)).toBe(false)

    if (!transcript) throw new Error('transcript surface did not mount')
    transcript.scrollTop = 37

    await act(async () => useSheetStore.setState({
      chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
    }))
    expect(testState.animate).toHaveBeenCalledTimes(1)
    expect(testState.animate.mock.instances[0]).toBe(surface)

    await act(async () => {
      testState.chatStore.setState({
        messages: [createMessage(1, 'assistant', 'Historical answer updated')],
        runPhase: 'streaming'
      })
    })

    expect(container.querySelector('[data-testid="chat-transcript-entrance-surface"]'))
      .toBe(surface)
    expect(surface?.querySelector('[data-testid="transcript"]')).toBe(transcript)
    expect(transcript.scrollTop).toBe(37)
    expect(testState.animate).toHaveBeenCalledTimes(1)
    expect(testState.animate.mock.results[0]?.value.cancel).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="chat-header"]')).toBe(header)
    expect(container.querySelector('[data-testid="chat-input"]')).toBe(composer)
    expect(container.querySelector('[data-testid="artifacts"]')).toBe(artifacts)
  })

  it('consumes a matching request when WAAPI is unavailable', async () => {
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: undefined
    })
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Historical answer')]
    })

    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      useSheetStore.setState({
        chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
      })
    })

    expect(testState.animate).not.toHaveBeenCalled()
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('consumes a stale request without animating another chat', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-b',
      messages: [createMessage(2, 'assistant', 'Current answer', 'chat-b')]
    })

    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      useSheetStore.setState({
        chatLoading: false,
        chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 2 }
      })
    })

    expect(testState.animate).not.toHaveBeenCalled()
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('clears an empty-chat request before a fresh submission can reuse it', async () => {
    testState.chatStore.setState({ currentChatUuid: 'chat-a' })
    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      useSheetStore.setState({
        chatLoading: true,
        chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
      })
    })

    await act(async () => {
      testState.chatStore.setState({
        pendingUserMessage: {
          submissionId: 'fresh-after-empty',
          chatUuid: 'chat-a',
          text: 'Fresh question',
          mediaCtx: [],
          createdAt: 1
        }
      })
      useSheetStore.setState({ chatLoading: false })
    })

    expect(testState.animate).not.toHaveBeenCalled()
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('cancels the previous surface animation when the selection epoch changes', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Answer A')]
    })

    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      useSheetStore.setState({
        chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
      })
    })
    const firstAnimation = testState.animate.mock.results[0]?.value
    expect(firstAnimation).toBeDefined()

    await act(async () => {
      testState.chatStore.setState({
        currentChatUuid: 'chat-b',
        selectionEpoch: 2,
        messages: [createMessage(2, 'assistant', 'Answer B', 'chat-b')]
      })
    })
    expect(firstAnimation.cancel).toHaveBeenCalledTimes(1)
  })

  it('keeps a newer animation alive when an older same-epoch animation finishes late', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Answer A')]
    })
    await act(async () => root.render(<ChatWindow />))

    const firstRequest = { chatUuid: 'chat-a', selectionEpoch: 1 }
    await act(async () => useSheetStore.setState({ chatEntranceRequest: firstRequest }))
    const firstAnimation = testState.animate.mock.results[0]?.value

    const secondRequest = { chatUuid: 'chat-a', selectionEpoch: 1 }
    await act(async () => useSheetStore.setState({ chatEntranceRequest: secondRequest }))
    const secondAnimation = testState.animate.mock.results[1]?.value
    expect(firstAnimation.cancel).toHaveBeenCalledTimes(1)
    expect(secondAnimation).toBeDefined()

    const firstFinish = firstAnimation.addEventListener.mock.calls[0]?.[1]
    await act(async () => firstFinish?.())
    await act(async () => {
      testState.chatStore.setState({
        currentChatUuid: 'chat-b',
        selectionEpoch: 2,
        messages: [createMessage(2, 'assistant', 'Answer B', 'chat-b')]
      })
    })
    expect(secondAnimation.cancel).toHaveBeenCalledTimes(1)
  })

  it('replays a new pointer request after a keyboard revisit of another chat', async () => {
    const messageA = createMessage(1, 'assistant', 'Answer A', 'chat-a')
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [messageA],
      selectionEpoch: 1
    })
    await act(async () => root.render(<ChatWindow />))

    const firstRequest = { chatUuid: 'chat-a', selectionEpoch: 1 }
    await act(async () => useSheetStore.setState({ chatEntranceRequest: firstRequest }))
    const firstAnimation = testState.animate.mock.results[0]?.value

    // The keyboard selection changes the shell and publishes no entrance request.
    await act(async () => {
      testState.chatStore.setState({
        currentChatUuid: 'chat-b',
        messages: [createMessage(2, 'assistant', 'Answer B', 'chat-b')],
        selectionEpoch: 1
      })
    })
    expect(firstAnimation.cancel).toHaveBeenCalledTimes(1)
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()

    const secondRequest = { chatUuid: 'chat-a', selectionEpoch: 1 }
    await act(async () => {
      testState.chatStore.setState({
        currentChatUuid: 'chat-a',
        messages: [messageA],
        selectionEpoch: 1
      })
      useSheetStore.setState({ chatEntranceRequest: secondRequest })
    })

    expect(testState.animate).toHaveBeenCalledTimes(2)
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('cancels the active animation when the surface unmounts', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Historical answer')]
    })
    await act(async () => root.render(<ChatWindow />))
    await act(async () => {
      useSheetStore.setState({
        chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
      })
    })
    const animation = testState.animate.mock.results[0]?.value

    await act(async () => root.unmount())
    rootUnmounted = true
    await act(async () => Promise.resolve())
    expect(animation.cancel).toHaveBeenCalledTimes(1)
  })

  it('keeps a consumed request from replaying under StrictMode', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Historical answer')]
    })
    useSheetStore.setState({
      chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
    })

    await act(async () => {
      root.render(
        <React.StrictMode>
          <ChatWindow />
        </React.StrictMode>
      )
    })

    expect(testState.animate).toHaveBeenCalledTimes(1)
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()
  })

  it('keeps an active animation through StrictMode simulated cleanup', async () => {
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Historical answer')]
    })
    useSheetStore.setState({
      chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
    })

    await act(async () => {
      root.render(
        <React.StrictMode>
          <ChatWindow />
        </React.StrictMode>
      )
    })

    const animation = testState.animate.mock.results[0]?.value
    expect(testState.animate).toHaveBeenCalledTimes(1)
    expect(animation.cancel).not.toHaveBeenCalled()
    await act(async () => Promise.resolve())
    expect(animation.cancel).not.toHaveBeenCalled()
  })

  it('skips the animation for reduced motion and cancels when the preference changes', async () => {
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => mediaQuery)
    })
    testState.chatStore.setState({
      currentChatUuid: 'chat-a',
      messages: [createMessage(1, 'assistant', 'Reduced answer')]
    })
    useSheetStore.setState({
      chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
    })

    await act(async () => root.render(<ChatWindow />))
    expect(testState.animate).not.toHaveBeenCalled()
    expect(useSheetStore.getState().chatEntranceRequest).toBeNull()

    const changeHandler = mediaQuery.addEventListener.mock.calls[0]?.[1]
    mediaQuery.matches = false
    await act(async () => changeHandler?.())
    await act(async () => {
      useSheetStore.setState({
        chatEntranceRequest: { chatUuid: 'chat-a', selectionEpoch: 1 }
      })
    })
    await act(async () => Promise.resolve())
    expect(testState.animate).toHaveBeenCalledTimes(1)

    mediaQuery.matches = true
    await act(async () => changeHandler?.())
    const animation = testState.animate.mock.results[0]?.value
    expect(animation.cancel).toHaveBeenCalledTimes(1)
  })
})
