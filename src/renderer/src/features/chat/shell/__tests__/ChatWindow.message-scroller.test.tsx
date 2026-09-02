// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRunScrollHint } from '@renderer/features/chat/state/chatRunUiStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const scrollerMocks = vi.hoisted(() => ({
  scrollToMessage: vi.fn(),
  clearScrollHint: vi.fn(),
  store: {
    scrollHint: { type: 'none' } as ChatRunScrollHint,
    clearScrollHint: vi.fn(),
    upsertMessage: vi.fn(),
    patchMessageUiState: vi.fn(),
  },
}));

vi.mock('@renderer/shared/components/ui/message-scroller', () => {
  const Provider = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div
      data-testid="message-scroller-provider"
      data-auto-scroll={String(props.autoScroll)}
      data-default-scroll-position={String(props.defaultScrollPosition)}
      data-scroll-margin={String(props.scrollMargin)}
    >
      {children}
    </div>
  );
  const Root = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="message-scroller-root" {...props}>
      {children}
    </div>
  );
  const Viewport = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="message-scroller-viewport" {...props}>
      {children}
    </div>
  );
  const Content = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="message-scroller-content" {...props}>
      {children}
    </div>
  );
  const Item = ({
    children,
    messageId,
    scrollAnchor,
    ...props
  }: React.PropsWithChildren<{
    messageId?: string;
    scrollAnchor?: boolean;
  }>) => (
    <div
      data-testid="message-scroller-item"
      data-message-id={messageId}
      data-scroll-anchor={String(scrollAnchor)}
      {...props}
    >
      {children}
    </div>
  );
  const Button = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" data-testid="message-scroller-button" {...props} />
  );

  return {
    MessageScrollerProvider: Provider,
    MessageScroller: Root,
    MessageScrollerViewport: Viewport,
    MessageScrollerContent: Content,
    MessageScrollerItem: Item,
    MessageScrollerButton: Button,
    useMessageScroller: () => ({
      scrollToMessage: scrollerMocks.scrollToMessage,
    }),
    useMessageScrollerScrollable: () => ({ start: false, end: false }),
    useMessageScrollerVisibility: () => ({
      currentAnchorId: null,
      visibleMessageIds: [],
    }),
  };
});

vi.mock('@renderer/features/chat/message/ChatMessageComponent', () => ({
  default: ({
    message,
    pendingAssistantModel,
  }: {
    message?: ChatMessage;
    pendingAssistantModel?: { model?: string };
  }) => (
    <div data-testid="chat-message" data-role={message?.role ?? 'assistant'}>
      {pendingAssistantModel?.model ?? message?.role}
    </div>
  ),
}));

vi.mock('@renderer/features/chat/state/chatStore', () => {
  const useChatStore = Object.assign(
    (selector: (state: typeof scrollerMocks.store) => unknown) =>
      selector(scrollerMocks.store),
    { getState: () => scrollerMocks.store },
  );
  return { useChatStore };
});

import ChatTranscriptScroller from '../ChatTranscriptScroller';

const createMessage = (
  id: number,
  role: 'user' | 'assistant',
): MessageEntity => ({
  id,
  body: {
    role,
    content: role === 'user' ? 'question' : 'answer',
    segments: [],
  },
});

describe('ChatWindow MessageScroller integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    scrollerMocks.store.scrollHint = { type: 'none' };
    scrollerMocks.store.clearScrollHint.mockReset();
    scrollerMocks.scrollToMessage.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderScroller = async (
    scrollHint: ChatRunScrollHint = { type: 'none' },
  ) => {
    scrollerMocks.store.scrollHint = scrollHint;
    await act(async () => {
      root.render(
        <ChatTranscriptScroller
          chatUuid="chat-a"
          displayMessages={[
            createMessage(1, 'user'),
            createMessage(2, 'assistant'),
          ]}
          previewRenderIndex={-1}
          lastAssistantIndex={1}
          lastMessageIndex={1}
          latestUserIndex={0}
          hasCurrentTurnAssistant
          shouldRenderPendingAssistant={false}
          pendingAssistantModel={{ model: 'test-model' }}
          topOcclusionPx={56}
          isRunStreaming={false}
        />,
      );
    });
  };

  it('configures the provider and exposes string ids plus user anchors', async () => {
    await renderScroller();

    expect(
      container.querySelector('[data-testid="message-scroller-provider"]'),
    ).toMatchObject({
      dataset: expect.objectContaining({
        autoScroll: 'true',
        defaultScrollPosition: 'end',
        scrollMargin: '56',
      }),
    });
    expect(
      [
        ...container.querySelectorAll<HTMLElement>(
          '[data-testid="message-scroller-item"]',
        ),
      ].map((item) => ({
        id: item.dataset.messageId,
        anchor: item.dataset.scrollAnchor,
      })),
    ).toEqual([
      { id: '1', anchor: 'true' },
      { id: '2', anchor: 'false' },
    ]);
    expect(
      container.querySelectorAll('[data-slot="message-avatar"]'),
    ).toHaveLength(0);
    const content = container.querySelector<HTMLElement>(
      '[data-testid="message-scroller-content"]',
    );
    expect(content?.classList.contains('gap-6')).toBe(true);
    expect(content?.style.paddingBlockStart).toBe('56px');
  });

  it('consumes a search hint once and requests a margin-aware jump', async () => {
    await renderScroller({
      type: 'search-result',
      chatUuid: 'chat-a',
      messageId: 2,
    });

    expect(scrollerMocks.scrollToMessage).toHaveBeenCalledTimes(1);
    expect(scrollerMocks.scrollToMessage).toHaveBeenCalledWith('2', {
      align: 'start',
      behavior: 'auto',
      scrollMargin: 56,
    });
    expect(scrollerMocks.store.clearScrollHint).toHaveBeenCalledTimes(1);

    await renderScroller({
      type: 'search-result',
      chatUuid: 'chat-a',
      messageId: 2,
    });
    expect(scrollerMocks.scrollToMessage).toHaveBeenCalledTimes(1);
  });
});
