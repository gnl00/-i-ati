// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const scrollerMocks = vi.hoisted(() => ({
  store: {
    scrollHint: { type: 'none' },
    clearScrollHint: vi.fn(),
    upsertMessage: vi.fn(),
    patchMessageUiState: vi.fn(),
  },
}))

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
    content: `${role}-${id}`,
    segments: [],
  },
})

describe('ChatTranscriptScroller with the installed message scroller', () => {
  let container: HTMLDivElement
  let root: Root
  let originalIntersectionObserver: typeof IntersectionObserver | undefined
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame
  let pendingAnimationFrames: Array<{ id: number; callback: FrameRequestCallback }>
  let nextAnimationFrameId: number

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    originalIntersectionObserver = globalThis.IntersectionObserver
    originalRequestAnimationFrame = window.requestAnimationFrame
    originalCancelAnimationFrame = window.cancelAnimationFrame
    pendingAnimationFrames = []
    nextAnimationFrameId = 0
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
    })
    window.requestAnimationFrame = callback => {
      const id = ++nextAnimationFrameId
      pendingAnimationFrames.push({ id, callback })
      return id
    }
    window.cancelAnimationFrame = id => {
      pendingAnimationFrames = pendingAnimationFrames.filter(frame => frame.id !== id)
    }
    scrollerMocks.store.scrollHint = { type: 'none' }
    scrollerMocks.store.clearScrollHint.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  })

  const flushAnimationFrames = async () => {
    for (let attempt = 0; attempt < 10 && pendingAnimationFrames.length > 0; attempt += 1) {
      const frames = pendingAnimationFrames.splice(0)
      await act(async () => {
        for (const frame of frames) {
          frame.callback(performance.now())
        }
      })
    }
  }

  it('uses the primitive fallback visibility path to mount a visible historical body', async () => {
    const messages = Array.from({ length: 6 }, (_, index) =>
      createMessage(index + 1, index % 2 === 0 ? 'user' : 'assistant'),
    )

    await act(async () => {
      root.render(
        <ChatTranscriptScroller
          chatUuid="chat-a"
          displayMessages={messages}
          previewRenderIndex={-1}
          lastAssistantIndex={-1}
          lastMessageIndex={-1}
          latestUserIndex={-1}
          hasCurrentTurnAssistant={false}
          shouldRenderPendingAssistant={false}
          pendingAssistantModel={{ model: 'test-model' }}
          topOcclusionPx={56}
          isRunStreaming={false}
        />,
      )
    })

    expect(container.querySelectorAll('[data-slot="message-scroller-item"]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(2)

    const viewport = container.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')
    expect(viewport).not.toBeNull()
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 500 })
    vi.spyOn(viewport!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 500,
      left: 0,
      right: 800,
      width: 800,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    const itemTops = [-300, -180, 120, 700, 820, 940]
    const items = [...container.querySelectorAll<HTMLElement>('[data-slot="message-scroller-item"]')]
    items.forEach((item, index) => {
      const top = itemTops[index]
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom: top + 100,
        left: 0,
        right: 800,
        width: 800,
        height: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      })
    })

    await act(async () => {
      viewport!.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await flushAnimationFrames()

    expect(container.querySelectorAll('[data-testid="chat-message"]')).toHaveLength(3)
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-slot="message-scroller-item"]')]
        .find(item => item.dataset.messageId === '3')
        ?.querySelector('[data-testid="chat-message"]'),
    ).not.toBeNull()
  })
})
