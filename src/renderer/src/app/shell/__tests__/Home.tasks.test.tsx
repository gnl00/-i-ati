// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useChatStore } from '@renderer/features/chat';

vi.mock('@renderer/features/chat', async () => {
  const actual = await vi.importActual<
    typeof import('@renderer/features/chat')
  >('@renderer/features/chat');
  return {
    useChatStore: actual.useChatStore,
    ChatWindow: (): ReactElement => (
      <div>
        <textarea aria-label="Draft" defaultValue="Unsent draft" />
        <div data-testid="transcript" style={{ overflow: 'auto', height: 40 }}>
          History
        </div>
      </div>
    ),
    retainChatRunIngress: (): (() => void) => () => {},
    ChatSheet: (): ReactElement => <div />,
    ChatSheetHover: actual.ChatSheetHover,
    TasksPage: (): ReactElement => <section aria-label="Tasks page" />,
  };
});
vi.mock('@renderer/shared/components/ui/sonner', () => ({
  Toaster: (): null => null,
}));
vi.mock('@renderer/shared/components/ui/toaster', () => ({
  Toaster: (): null => null,
}));
import Home from '../Home';

it('keeps the chat DOM, draft and scroll position when entering and returning from Tasks', async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  useChatStore.setState({ tasksPageOpen: false });
  try {
    await act(async () => root.render(<Home />));
    const hoverTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reveal sidebar shortcut"]',
    )!;
    const input = container.querySelector('textarea')!;
    input.value = 'Keep this draft';
    const transcript = container.querySelector<HTMLElement>(
      '[data-testid="transcript"]',
    )!;
    transcript.scrollTop = 120;
    await act(async () => useChatStore.getState().setTasksPageOpen(true));
    expect(container.querySelector('textarea')).toBe(input);
    expect(
      container.querySelector('button[aria-label="Reveal sidebar shortcut"]'),
    ).toBe(hoverTrigger);
    const tasksPage = container.querySelector('[aria-label="Tasks page"]')!;
    expect(tasksPage.nextElementSibling).toBe(hoverTrigger);
    vi.useFakeTimers();
    try {
      await act(async () =>
        hoverTrigger.dispatchEvent(
          new PointerEvent('pointerover', {
            bubbles: true,
            pointerType: 'mouse',
          }),
        ),
      );
      expect(
        container
          .querySelector('button[aria-label="Open sidebar"]')
          ?.getAttribute('data-revealed'),
      ).toBe('true');
      await act(async () => vi.advanceTimersByTime(2500));
      expect(
        container
          .querySelector('button[aria-label="Open sidebar"]')
          ?.getAttribute('data-revealed'),
      ).toBe('false');
      expect(
        container.querySelector('button[aria-label="Reveal sidebar shortcut"]'),
      ).toBe(hoverTrigger);
    } finally {
      vi.useRealTimers();
    }
    await act(async () => useChatStore.getState().setTasksPageOpen(false));
    expect(container.querySelector('textarea')).toBe(input);
    expect(input.value).toBe('Keep this draft');
    expect(transcript.scrollTop).toBe(120);
    expect(input.closest('[inert]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
