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
    scrollHint: { type: 'none' },
    setArtifactsPanel: vi.fn(),
    clearScrollHint: vi.fn(),
    patchMessageUiState: vi.fn(),
    upsertMessage: vi.fn()
  },
  virtualizerOptions: undefined as Record<string, unknown> | undefined
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
  default: () => <div>Message</div>
}))

vi.mock('@renderer/features/chat/welcome/SmartWelcomeEntrance', () => ({
  default: () => <div>Welcome</div>
}))

vi.mock('@renderer/features/chat/useScrollManagerTop', () => ({
  useScrollManagerTop: () => ({
    scrollParentRef: { current: null },
    showJumpToLatest: false,
    isButtonFadingOut: false,
    showJumpToLatestButton: vi.fn(),
    hideJumpToLatestButton: vi.fn(),
    scrollToMessageIndex: vi.fn()
  })
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
      isAtEnd: () => true,
      scrollToEnd: vi.fn()
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

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    testState.virtualizerOptions = undefined
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.stubGlobal('ResizeObserver', class {
      observe(): void { return }
      disconnect(): void { return }
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
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
})
