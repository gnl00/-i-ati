// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatRunScrollHint } from '@renderer/features/chat/state/chatRunUiStore'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const scrollerMocks = vi.hoisted(() => ({
  scrollToMessage: vi.fn(() => true),
  visibility: {
    currentAnchorId: null,
    visibleMessageIds: [] as string[],
  },
  store: {
    scrollHint: { type: 'none' } as ChatRunScrollHint,
    clearScrollHint: vi.fn(),
    upsertMessage: vi.fn(),
    patchMessageUiState: vi.fn(),
  },
}))

vi.mock('@renderer/shared/components/ui/message-scroller', () => {
  const Provider = ({ children }: React.PropsWithChildren) => <div>{children}</div>
  const Root = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  )
  const Viewport = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  )
  const Content = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  )
  const Item = ({ children, messageId, scrollAnchor, ...props }: React.PropsWithChildren<{
    messageId?: string
    scrollAnchor?: boolean
  }>) => (
    <div data-testid="message-scroller-item" data-message-id={messageId} data-scroll-anchor={String(scrollAnchor)} {...props}>
      {children}
    </div>
  )
  const Button = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props} />

  return {
    MessageScrollerProvider: Provider,
    MessageScroller: Root,
    MessageScrollerViewport: Viewport,
    MessageScrollerContent: Content,
    MessageScrollerItem: Item,
    MessageScrollerButton: Button,
    useMessageScroller: () => ({ scrollToMessage: scrollerMocks.scrollToMessage }),
    useMessageScrollerVisibility: () => scrollerMocks.visibility,
  }
})

vi.mock('@renderer/features/chat/message/ChatMessageComponent', () => ({
  default: ({ message, pendingAssistantModel }: {
    message?: ChatMessage
    pendingAssistantModel?: { model?: string }
  }) => (
    <div data-testid="chat-message" data-role={message?.role ?? 'assistant'}>
      {pendingAssistantModel?.model ?? message?.role}
    </div>
  ),
}))

vi.mock('@renderer/features/chat/state/chatStore', () => {
  const useChatStore = Object.assign(
    (selector: (state: typeof scrollerMocks.store) => unknown) => selector(scrollerMocks.store),
    { getState: () => scrollerMocks.store },
  )
  return { useChatStore }
})

import ChatTranscriptScroller from '../ChatTranscriptScroller'

const createMessage = (id: number, role: 'user' | 'assistant'): MessageEntity => ({
  id,
  body: {
    role,
    content: role === 'user' ? `question-${id}` : `answer-${id}`,
    segments: [],
  },
})

describe('ChatTranscriptScroller demand-mounted bodies', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    scrollerMocks.visibility = { currentAnchorId: null, visibleMessageIds: [] }
    scrollerMocks.store.scrollHint = { type: 'none' }
    scrollerMocks.store.clearScrollHint.mockReset()
    scrollerMocks.scrollToMessage.mockReset()
    scrollerMocks.scrollToMessage.mockReturnValue(true)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const renderScroller = async ({
    chatUuid = 'chat-a',
    displayMessages,
    latestUserIndex = -1,
    lastAssistantIndex = -1,
    lastMessageIndex = -1,
    hasCurrentTurnAssistant = false,
    shouldRenderPendingAssistant = false,
    scrollHint = { type: 'none' } as ChatRunScrollHint,
  }: {
    chatUuid?: string
    displayMessages: MessageEntity[]
    latestUserIndex?: number
    lastAssistantIndex?: number
    lastMessageIndex?: number
    hasCurrentTurnAssistant?: boolean
    shouldRenderPendingAssistant?: boolean
    scrollHint?: ChatRunScrollHint
  }) => {
    scrollerMocks.store.scrollHint = scrollHint
    await act(async () => {
      root.render(
        <ChatTranscriptScroller
          chatUuid={chatUuid}
          displayMessages={displayMessages}
          previewRenderIndex={-1}
          lastAssistantIndex={lastAssistantIndex}
          lastMessageIndex={lastMessageIndex}
          latestUserIndex={latestUserIndex}
          hasCurrentTurnAssistant={hasCurrentTurnAssistant}
          shouldRenderPendingAssistant={shouldRenderPendingAssistant}
          pendingAssistantModel={{ model: 'test-model' }}
          topOcclusionPx={56}
          isRunStreaming={false}
        />,
      )
    })
  }

  it('keeps every shell registered while bounding initial message body mounts', async () => {
    const messages = [
      createMessage(1, 'user'),
      createMessage(2, 'assistant'),
      createMessage(3, 'user'),
      createMessage(4, 'assistant'),
      createMessage(5, 'user'),
      createMessage(6, 'assistant'),
    ]

    await renderScroller({ displayMessages: messages })

    expect(container.querySelectorAll('[data-testid="message-scroller-item"]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid="message-body-placeholder"]')).toHaveLength(4)
    const placeholder = container.querySelector<HTMLElement>('[data-testid="message-body-placeholder"]')
    expect(placeholder?.getAttribute('role')).toBe('status')
    expect(placeholder?.getAttribute('aria-label')).toBe('Message content loading')
    expect(placeholder?.style.minHeight).toBe('10rem')
  })

  it('mounts visible bodies and retains them after visibility moves away', async () => {
    const messages = Array.from({ length: 6 }, (_, index) =>
      createMessage(index + 1, index % 2 === 0 ? 'user' : 'assistant'),
    )

    await renderScroller({ displayMessages: messages })
    scrollerMocks.visibility = { currentAnchorId: null, visibleMessageIds: ['3'] }
    await renderScroller({ displayMessages: messages })

    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(3)

    scrollerMocks.visibility = { currentAnchorId: null, visibleMessageIds: [] }
    await renderScroller({ displayMessages: messages })

    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(3)
  })

  it('force-mounts the latest user and assistant beside the tail bodies', async () => {
    const scheduleMarker = createMessage(6, 'user')
    scheduleMarker.body.source = 'schedule'
    const messages = [
      createMessage(1, 'user'),
      createMessage(2, 'assistant'),
      createMessage(3, 'user'),
      createMessage(4, 'assistant'),
      createMessage(5, 'user'),
      scheduleMarker,
    ]

    await renderScroller({
      displayMessages: messages,
      latestUserIndex: 4,
      lastAssistantIndex: 3,
    })

    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(3)
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-testid="message-scroller-item"]')]
        .filter(item => item.querySelector('[data-testid="chat-message"]'))
        .map(item => item.dataset.messageId),
    ).toEqual(['4', '5', '6'])
  })

  it('force-mounts a search target before jumping and retains it after the hint clears', async () => {
    const messages = Array.from({ length: 6 }, (_, index) =>
      createMessage(index + 1, index % 2 === 0 ? 'user' : 'assistant'),
    )

    await renderScroller({
      displayMessages: messages,
      scrollHint: { type: 'search-result', chatUuid: 'chat-a', messageId: 3 },
    })

    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(3)
    expect(scrollerMocks.scrollToMessage).toHaveBeenCalledWith('3', {
      align: 'start',
      behavior: 'auto',
      scrollMargin: 56,
    })

    await renderScroller({ displayMessages: messages })

    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(3)
  })

  it('resets retained bodies when the conversation identity changes', async () => {
    const messages = Array.from({ length: 6 }, (_, index) =>
      createMessage(index + 1, index % 2 === 0 ? 'user' : 'assistant'),
    )

    await renderScroller({ displayMessages: messages })
    scrollerMocks.visibility = { currentAnchorId: null, visibleMessageIds: ['3'] }
    await renderScroller({ displayMessages: messages })
    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(3)

    scrollerMocks.visibility = { currentAnchorId: null, visibleMessageIds: [] }
    await renderScroller({ chatUuid: 'chat-b', displayMessages: messages })

    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(2)
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-testid="message-scroller-item"]')]
        .find(item => item.dataset.messageId === '3')
        ?.querySelector('[data-testid="message-body-placeholder"]'),
    ).not.toBeNull()
  })

  it('keeps the pending assistant shell identity through commitment', async () => {
    const user = createMessage(1, 'user')
    const assistant = createMessage(2, 'assistant')

    await renderScroller({
      displayMessages: [user],
      latestUserIndex: 0,
      shouldRenderPendingAssistant: true,
    })

    expect(
      [...container.querySelectorAll<HTMLElement>('[data-testid="message-scroller-item"]')]
        .at(-1)?.dataset.messageId,
    ).toBe('pending-assistant:chat-a')

    await renderScroller({
      displayMessages: [user, assistant],
      latestUserIndex: 0,
      lastAssistantIndex: 1,
      hasCurrentTurnAssistant: true,
    })

    expect(
      [...container.querySelectorAll<HTMLElement>('[data-testid="message-scroller-item"]')]
        .at(-1)?.dataset.messageId,
    ).toBe('2')
    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(2)
  })
})
