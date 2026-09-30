// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSheetStore } from '../../state/sheetStore';
import ChatSheetHover from '../ChatSheetHover';

let container: HTMLDivElement;
let root: Root;
const corner = (): HTMLButtonElement =>
  container.querySelector('button[aria-label="Reveal sidebar shortcut"]')!;
const hint = (): HTMLButtonElement | null =>
  container.querySelector('button[aria-label="Open sidebar"]');
const hintVisible = (): boolean => hint()?.dataset.revealed === 'true';
const pointer = async (
  target: HTMLElement,
  type: string,
  pointerType = 'mouse',
): Promise<void> => {
  await act(async () =>
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerType }),
    ),
  );
};
const advance = async (ms: number): Promise<void> => {
  await act(async () => vi.advanceTimersByTime(ms));
};

beforeEach(async () => {
  vi.useFakeTimers();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  useSheetStore.setState({ sheetOpenState: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ChatSheetHover />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

it('starts invisible, reveals on corner hover, and hides after 2.5 seconds without opening', async () => {
  expect(hintVisible()).toBe(false);
  expect(hint()!.tabIndex).toBe(-1);
  await pointer(corner(), 'pointerover');
  expect(hintVisible()).toBe(true);
  expect(corner().getAttribute('aria-expanded')).toBe('true');
  expect(hint()!.tabIndex).toBe(0);
  await advance(2499);
  expect(hintVisible()).toBe(true);
  await advance(1);
  expect(hintVisible()).toBe(false);
  expect(hint()!.tabIndex).toBe(-1);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
});

it('pauses the timeout while the pointer is on the hint and restarts on leave', async () => {
  await pointer(corner(), 'pointerover');
  await advance(1000);
  await pointer(hint()!, 'pointerover');
  await advance(3000);
  expect(hintVisible()).toBe(true);
  await pointer(hint()!, 'pointerout');
  await advance(2500);
  expect(hintVisible()).toBe(false);
});

it('hides on another corner entry and opens the sheet when the hint is clicked', async () => {
  await pointer(corner(), 'pointerover');
  await pointer(corner(), 'pointerout');
  await pointer(corner(), 'pointerover');
  expect(hintVisible()).toBe(false);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await act(async () => corner().click());
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await pointer(corner(), 'pointerout');
  await pointer(corner(), 'pointerover');
  await act(async () => hint()!.click());
  expect(useSheetStore.getState().sheetOpenState).toBe(true);
  expect(container.querySelector('button')).toBeNull();
  await act(async () => useSheetStore.getState().setSheetOpenState(false));
  expect(hintVisible()).toBe(false);
});

it('opens from the overlapping corner only while the hint is visible', async () => {
  await act(async () => corner().click());
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await pointer(corner(), 'pointerover');
  expect(hintVisible()).toBe(true);
  await act(async () => corner().click());
  expect(useSheetStore.getState().sheetOpenState).toBe(true);
});

it('supports keyboard discovery, activation, and dismissal', async () => {
  await act(async () =>
    corner().dispatchEvent(new FocusEvent('focusin', { bubbles: true })),
  );
  expect(hintVisible()).toBe(true);
  await act(async () => corner().click());
  expect(useSheetStore.getState().sheetOpenState).toBe(true);
  await act(async () => useSheetStore.getState().setSheetOpenState(false));
  await act(async () =>
    corner().dispatchEvent(new FocusEvent('focusin', { bubbles: true })),
  );
  expect(hintVisible()).toBe(true);
  await act(async () =>
    hint()!.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
    ),
  );
  expect(hintVisible()).toBe(false);
  await pointer(corner(), 'pointerover');
  await act(async () => hint()!.click());
  expect(useSheetStore.getState().sheetOpenState).toBe(true);
});

it('ignores touch hover and clears pending hint on external open or unmount', async () => {
  await pointer(corner(), 'pointerover', 'touch');
  expect(hintVisible()).toBe(false);
  await pointer(corner(), 'pointerover');
  await act(async () => useSheetStore.getState().setSheetOpenState(true));
  await act(async () => useSheetStore.getState().setSheetOpenState(false));
  await advance(3000);
  expect(hintVisible()).toBe(false);
  await pointer(corner(), 'pointerover');
  await act(async () => root.render(null));
  await advance(3000);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
});
