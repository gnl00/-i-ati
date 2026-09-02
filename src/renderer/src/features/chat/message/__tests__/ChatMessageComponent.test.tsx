// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatMessageComponent from '../ChatMessageComponent';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../user-message', () => ({
  UserMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid="mock-user-message">{String(message.content)}</div>
  ),
}));

vi.mock('../assistant-message', () => ({
  AssistantMessage: ({
    committedMessage,
  }: {
    committedMessage?: ChatMessage;
  }) => (
    <div data-testid="mock-assistant-message">
      {typeof committedMessage?.content === 'string'
        ? committedMessage.content
        : 'pending'}
    </div>
  ),
}));

vi.mock('../user-message/use-message-hover', () => ({
  useMessageHover: () => ({
    assistantMessageHovered: false,
    onMouseHoverAssistantMsg: vi.fn(),
    onMouseHoverUsrMsg: vi.fn(),
    userMessageOperationIdx: null,
  }),
}));

const createMessage = (
  role: 'user' | 'assistant',
  source?: string,
): ChatMessage => ({
  role,
  source,
  content: role === 'user' ? 'question' : 'answer',
  segments: [],
});

describe('ChatMessageComponent Message shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderMessage = async (message: ChatMessage): Promise<void> => {
    await act(async () => {
      root.render(
        <ChatMessageComponent
          index={0}
          messageId={10}
          message={message}
          isLatest
        />,
      );
    });
  };

  it('aligns user messages to the end without rendering an avatar slot', async () => {
    await renderMessage(createMessage('user'));

    const shell = container.querySelector<HTMLElement>('[data-slot="message"]');
    expect(shell?.dataset.align).toBe('end');
    expect(shell?.querySelector('[data-slot="message-avatar"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="mock-user-message"]'),
    ).not.toBeNull();
  });

  it('aligns assistant messages to the start without rendering an avatar slot', async () => {
    await renderMessage(createMessage('assistant'));

    const shell = container.querySelector<HTMLElement>('[data-slot="message"]');
    expect(shell?.dataset.align).toBe('start');
    expect(shell?.querySelector('[data-slot="message-avatar"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="mock-assistant-message"]'),
    ).not.toBeNull();
  });

  it('keeps schedule markers independent from Message alignment', async () => {
    await renderMessage(createMessage('user', 'schedule'));

    expect(container.querySelector('[data-slot="message"]')).toBeNull();
    expect(container.textContent).toContain('question');
  });
});
