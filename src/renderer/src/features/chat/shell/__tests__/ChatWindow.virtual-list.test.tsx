// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type, react/display-name */

import { act, forwardRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  chat: {
    messages: [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: 'Measured transcript row',
        segments: [],
        createdAt: 1,
        typewriterCompleted: true
      }
    }],
    preview: { message: null },
    pendingUserMessage: null,
    artifactsPanelOpen: false,
    currentChatUuid: 'chat-1',
    runPhase: 'idle',
    selectedModelRef: undefined,
    scrollHint: { type: 'none' } as {
      type: string
      chatUuid?: string
      messageId?: number
    },
    setArtifactsPanel: vi.fn(),
    clearScrollHint: vi.fn(),
    patchMessageUiState: vi.fn(),
    upsertMessage: vi.fn()
  },
  virtualizerOptions: undefined as Record<string, unknown> | undefined,
  scrollManager: {
    scrollParentRef: { current: null as HTMLDivElement | null },
    showJumpToLatest: false,
    isButtonFadingOut: false,
    showJumpToLatestButton: vi.fn(),
    hideJumpToLatestButton: vi.fn(),
    scrollToMessageIndex: vi.fn(),
    scrollToMessageOffset: vi.fn()
  },
  virtualizer: {
    getDistanceFromEnd: vi.fn(() => 0),
    scrollToEnd: vi.fn()
  },
  userScrollIntentRef: { current: null as ((source: 'wheel' | 'pointer') => void) | null }
}))

vi.mock('@renderer/features/artifacts', () => ({
  ArtifactsPanel: () => <div>Artifacts</div>
}))

vi.mock('../ChatHeader', () => ({
  default: () => <div>Header</div>
}))

vi.mock('../ChatSidePanelLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@renderer/features/chat/input/ChatInputArea', () => ({
  default: forwardRef(() => <div>Input</div>)
}))

vi.mock('@renderer/features/chat/input/ChatInputToolConfirmation', () => ({
  ChatInputToolConfirmation: () => <div>Confirmation</div>
}))

vi.mock('@renderer/features/chat/message/ChatMessageComponent', () => ({
  default: ({ onTypingChange }: { onTypingChange?: () => void }) => (
    <button data-testid="typing-change" onClick={onTypingChange}>Message</button>
  )
}))

vi.mock('@renderer/features/chat/welcome/SmartWelcomeEntrance', () => ({
  default: () => <div>Welcome</div>
}))

vi.mock('@renderer/features/chat/useScrollManagerTop', () => ({
  useScrollManagerTop: ({ onUserScrollIntentRef }: {
    onUserScrollIntentRef: typeof testState.userScrollIntentRef
  }) => {
    testState.userScrollIntentRef = onUserScrollIntentRef
    return testState.scrollManager
  }
}))

vi.mock('@renderer/shared/components/ui/resizable', () => ({
  ResizableHandle: () => <div />,
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@renderer/shared/lib/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' ')
}))

vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: (selector: (state: typeof testState.chat) => unknown) => selector(testState.chat)
}))

vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (selector: (state: {
    resolveModelRef: () => undefined
    providersRevision: number
  }) => unknown) => selector({
    resolveModelRef: () => undefined,
    providersRevision: 0
  })
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: Record<string, unknown>) => {
    testState.virtualizerOptions = options
    return {
      ...testState.virtualizer,
      containerRef: (node: HTMLElement | null) => {
        if (!node || options.directDomUpdates !== true) return
        node.dataset.directVirtualContainer = 'true'
        node.style.height = '777px'
      },
      measureElement: (node: HTMLElement | null) => {
        if (!node || options.directDomUpdates !== true) return
        node.dataset.directVirtualItem = 'true'
        node.style.transform = 'translate3d(0, 48px, 0)'
      },
      getTotalSize: () => 148,
      getVirtualItems: () => [{
        index: 0,
        key: 'message:1',
        start: 48,
        size: 100,
        end: 148,
        lane: 0
      }],
      isAtEnd: () => true
    }
  }
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: forwardRef<HTMLDivElement, { children?: ReactNode }>((props, ref) => (
      <div ref={ref}>{props.children}</div>
    ))
  }
}))

vi.mock('../../task/TaskPlanBar', () => ({
  TaskPlanBar: () => <div>Plan</div>
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
vi.mock('@renderer/features/chat/schedule/useScheduleNotifications', () => ({
  useScheduleNotifications: vi.fn()
}))

import ChatWindow from '../ChatWindow'

describe('ChatWindow virtual list', () => {
  let container: HTMLDivElement
  let root: Root
  let nextAnimationFrameId: number
  let animationFrameCallbacks: Map<number, FrameRequestCallback>

  const flushAnimationFrame = async () => {
    const callbacks = [...animationFrameCallbacks.values()]
    animationFrameCallbacks.clear()
    await act(async () => {
      callbacks.forEach(callback => callback(0))
    })
  }

  const setScrollMetrics = (
    element: HTMLDivElement,
    { scrollTop, scrollHeight, clientHeight }: {
      scrollTop: number
      scrollHeight: number
      clientHeight: number
    }
  ) => {
    Object.defineProperties(element, {
      scrollTop: { configurable: true, value: scrollTop, writable: true },
      scrollHeight: { configurable: true, value: scrollHeight },
      clientHeight: { configurable: true, value: clientHeight }
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    testState.virtualizerOptions = undefined
    testState.chat.runPhase = 'idle'
    testState.chat.scrollHint = { type: 'none' }
    testState.scrollManager.showJumpToLatest = false
    testState.scrollManager.isButtonFadingOut = false
    testState.scrollManager.showJumpToLatestButton.mockClear()
    testState.scrollManager.hideJumpToLatestButton.mockClear()
    testState.scrollManager.scrollToMessageIndex.mockClear()
    testState.scrollManager.scrollToMessageOffset.mockClear()
    testState.virtualizer.getDistanceFromEnd.mockClear()
    testState.virtualizer.scrollToEnd.mockClear()
    testState.userScrollIntentRef.current = null
    nextAnimationFrameId = 0
    animationFrameCallbacks = new Map()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.stubGlobal('ResizeObserver', class {
      observe(): void { return }
      disconnect(): void { return }
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextAnimationFrameId
      animationFrameCallbacks.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      animationFrameCallbacks.delete(id)
    }))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps virtual row geometry under the synchronous direct-DOM owner', async () => {
    await act(async () => root.render(<ChatWindow />))
    await act(async () => vi.advanceTimersByTime(220))

    expect(testState.virtualizerOptions).toMatchObject({
      directDomUpdates: true,
      directDomUpdatesMode: 'transform'
    })

    const row = container.querySelector<HTMLElement>('[data-virtual-index="0"]')
    const inner = row?.parentElement
    expect(inner?.dataset.directVirtualContainer).toBe('true')
    expect(inner?.style.height).toBe('777px')
    expect(row?.dataset.directVirtualItem).toBe('true')
    expect(row?.style.transform).toBe('translate3d(0, 48px, 0)')

    await act(async () => root.render(<ChatWindow />))

    expect(inner?.style.height).toBe('777px')
    expect(row?.style.transform).toBe('translate3d(0, 48px, 0)')
  })

  it('renders the tail-follow re-entry button after a search-result jump', async () => {
    testState.chat.scrollHint = {
      type: 'search-result',
      chatUuid: 'chat-1',
      messageId: 1
    }
    await act(async () => root.render(<ChatWindow />))
    await act(async () => vi.advanceTimersByTime(220))

    expect(testState.scrollManager.showJumpToLatestButton).toHaveBeenCalledTimes(1)

    testState.scrollManager.showJumpToLatest = true
    await act(async () => root.render(<ChatWindow />))

    expect(container.querySelector('#jumpToLatest')).toBeTruthy()
  })

  it('uses smooth motion only for a short static jump-to-latest request', async () => {
    await act(async () => root.render(<ChatWindow />))
    await act(async () => vi.advanceTimersByTime(220))
    animationFrameCallbacks.clear()
    testState.scrollManager.showJumpToLatest = true
    await act(async () => root.render(<ChatWindow />))

    const scrollContainer = testState.scrollManager.scrollParentRef.current
    expect(scrollContainer).toBeTruthy()
    setScrollMetrics(scrollContainer!, {
      scrollTop: 750,
      scrollHeight: 1600,
      clientHeight: 400
    })

    await act(async () => {
      container.querySelector<HTMLElement>('#jumpToLatest')?.click()
    })
    await flushAnimationFrame()

    expect(testState.scrollManager.scrollToMessageOffset).toHaveBeenCalledTimes(1)
    expect(testState.scrollManager.scrollToMessageOffset).toHaveBeenCalledWith(1200, 'smooth')
    expect(testState.virtualizerOptions).toMatchObject({
      followOnAppend: false
    })
  })

  it('hands the viewport back to wheel input during an active smooth jump', async () => {
    testState.scrollManager.showJumpToLatest = true
    await act(async () => root.render(<ChatWindow />))
    await act(async () => vi.advanceTimersByTime(220))
    animationFrameCallbacks.clear()
    await act(async () => root.render(<ChatWindow />))

    const scrollContainer = testState.scrollManager.scrollParentRef.current
    expect(scrollContainer).toBeTruthy()
    setScrollMetrics(scrollContainer!, {
      scrollTop: 750,
      scrollHeight: 1600,
      clientHeight: 400
    })

    await act(async () => {
      container.querySelector<HTMLElement>('#jumpToLatest')?.click()
    })
    await flushAnimationFrame()

    scrollContainer!.scrollTop = 820
    await act(async () => {
      testState.userScrollIntentRef.current?.('wheel')
    })

    expect(testState.scrollManager.scrollToMessageOffset).toHaveBeenLastCalledWith(820, 'auto')
    expect(testState.virtualizerOptions).toMatchObject({
      anchorTo: 'start',
      followOnAppend: false
    })
  })

  it('keeps streaming typing inside the jump transaction and corrects the end once', async () => {
    testState.chat.runPhase = 'streaming'
    testState.scrollManager.showJumpToLatest = true
    await act(async () => root.render(<ChatWindow />))
    await act(async () => vi.advanceTimersByTime(220))
    animationFrameCallbacks.clear()
    await act(async () => root.render(<ChatWindow />))

    const scrollContainer = testState.scrollManager.scrollParentRef.current
    expect(scrollContainer).toBeTruthy()
    setScrollMetrics(scrollContainer!, {
      scrollTop: 750,
      scrollHeight: 1600,
      clientHeight: 400
    })

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="typing-change"]')?.click()
    })
    await act(async () => {
      container.querySelector<HTMLElement>('#jumpToLatest')?.click()
    })
    await flushAnimationFrame()

    expect(testState.scrollManager.scrollToMessageOffset).toHaveBeenCalledWith(1200, 'auto')
    expect(testState.virtualizer.scrollToEnd).not.toHaveBeenCalled()

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="typing-change"]')?.click()
    })
    setScrollMetrics(scrollContainer!, {
      scrollTop: 1200,
      scrollHeight: 1800,
      clientHeight: 400
    })
    await flushAnimationFrame()

    expect(testState.virtualizer.scrollToEnd).not.toHaveBeenCalled()
    expect(testState.scrollManager.scrollToMessageOffset).toHaveBeenCalledTimes(2)
    expect(testState.scrollManager.scrollToMessageOffset).toHaveBeenLastCalledWith(1400, 'auto')
  })
})
