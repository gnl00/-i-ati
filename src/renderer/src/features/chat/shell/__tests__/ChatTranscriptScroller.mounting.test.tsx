// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatRunScrollHint } from '@renderer/features/chat/state/chatRunUiStore'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const scrollerMocks = vi.hoisted(() => ({
  chatStore: null as unknown as {
    setState: (state: Partial<{
      preview: { message: MessageEntity | null }
      scrollHint: ChatRunScrollHint
    }>, replace?: boolean) => void
  },
  messageRenders: {} as Record<number, number>,
  itemRenders: 0,
  scrollToMessage: vi.fn(() => true),
  visibility: {
    currentAnchorId: null,
    visibleMessageIds: [] as string[],
  },
  store: {
    preview: { message: null as MessageEntity | null },
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
  }>) => {
    scrollerMocks.itemRenders++
    return (
    <div data-testid="message-scroller-item" data-message-id={messageId} data-scroll-anchor={String(scrollAnchor)} {...props}>
      {children}
    </div>
    )
  }
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
  default: ({ messageId = -1, message, previewMessage, pendingAssistantModel }: {
    messageId?: number
    message?: ChatMessage
    previewMessage?: ChatMessage
    pendingAssistantModel?: { model?: string }
  }) => {
    scrollerMocks.messageRenders[messageId] = (scrollerMocks.messageRenders[messageId] ?? 0) + 1
    return (
      <div data-testid="chat-message" data-role={message?.role ?? 'assistant'}>
        {String(previewMessage?.content ?? pendingAssistantModel?.model ?? message?.role ?? '')}
      </div>
    )
  },
}))

vi.mock('@renderer/features/chat/state/chatStore', async () => {
  const { create } = await import('zustand')
  const useChatStore = create(() => scrollerMocks.store)
  scrollerMocks.chatStore = {
    setState: (state, replace) => {
      if (replace) useChatStore.setState({ ...scrollerMocks.store, ...state }, true)
      else useChatStore.setState(state)
    },
  }
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
    scrollerMocks.store.preview = { message: null }
    scrollerMocks.chatStore.setState(scrollerMocks.store, true)
    scrollerMocks.messageRenders = {}
    scrollerMocks.itemRenders = 0
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
    previewRenderIndex = -1,
    displayMessages,
    latestUserIndex = -1,
    lastAssistantIndex = -1,
    lastMessageIndex = -1,
    hasCurrentTurnAssistant = false,
    shouldRenderPendingAssistant = false,
    scrollHint = { type: 'none' } as ChatRunScrollHint,
  }: {
    chatUuid?: string
    previewRenderIndex?: number
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
      scrollerMocks.chatStore.setState({ scrollHint })
      root.render(
        <ChatTranscriptScroller
          chatUuid={chatUuid}
          displayMessages={displayMessages}
          previewRenderIndex={previewRenderIndex}
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

  it('updates only the preview owner and reads the latest preview when jumping', async () => {
    const messages = [createMessage(1, 'user'), createMessage(2, 'assistant')]
    await renderScroller({ displayMessages: messages, lastAssistantIndex: 1,
      lastMessageIndex: 1, latestUserIndex: 0, hasCurrentTurnAssistant: true, previewRenderIndex: 1 })
    const userRenders = scrollerMocks.messageRenders[1]
    const assistantRenders = scrollerMocks.messageRenders[2]
    const itemRenders = scrollerMocks.itemRenders
    const node = container.querySelector('[data-message-id="2"]')
    const latest = { ...messages[1], body: { ...messages[1].body, content: 'Latest patch',
      segments: [{ segmentId: 'text-1', type: 'text', content: 'Latest patch', timestamp: 1 }] } } as MessageEntity
    await act(async () => scrollerMocks.chatStore.setState({ preview: { message: latest } }))
    expect(container.textContent).toContain('Latest patch')
    expect(scrollerMocks.itemRenders).toBe(itemRenders)
    expect(scrollerMocks.messageRenders[1]).toBe(userRenders)
    expect(scrollerMocks.messageRenders[2]).toBe(assistantRenders + 1)
    expect(container.querySelector('[data-message-id="2"]')).toBe(node)
    await act(async () => container.querySelector('button')!.click())
    expect(scrollerMocks.store.upsertMessage).toHaveBeenCalledWith({ ...latest,
      body: { ...latest.body, typewriterCompleted: true } })
    await act(async () => scrollerMocks.chatStore.setState({ preview: { message: null } }))
    expect(container.textContent).not.toContain('Latest patch')
  })

  it('renders preview patches before the assistant message is committed', async () => {
    await renderScroller({ displayMessages: [createMessage(1, 'user')], latestUserIndex: 0,
      shouldRenderPendingAssistant: true })
    await act(async () => scrollerMocks.chatStore.setState({ preview: {
      message: { body: { role: 'assistant', content: 'Pending preview' } } as MessageEntity
    } }))
    expect(container.textContent).toContain('Pending preview')
  })

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
