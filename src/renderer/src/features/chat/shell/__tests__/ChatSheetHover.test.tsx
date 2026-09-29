// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSheetStore } from '../../state/sheetStore';
import ChatSheetHover from '../ChatSheetHover';

let container: HTMLDivElement;
let root: Root;
const button = (): HTMLButtonElement => container.querySelector('button')!;
const pointer = async (type: string, pointerType = 'mouse'): Promise<void> => {
  await act(async () =>
    button().dispatchEvent(
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

it('shows feedback immediately and opens only after 250ms; closing restores the idle trigger', async () => {
  await pointer('pointerover');
  expect(button().dataset.pending).toBe('true');
  await advance(249);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await advance(1);
  expect(useSheetStore.getState().sheetOpenState).toBe(true);
  expect(container.querySelector('button')).toBeNull();
  await act(async () => useSheetStore.getState().setSheetOpenState(false));
  expect(button().dataset.pending).toBe('false');
  await advance(500);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
});

it('cancels on leaving and starts a fresh dwell on re-entry', async () => {
  await pointer('pointerover');
  await advance(200);
  await pointer('pointerout');
  expect(button().dataset.pending).toBe('false');
  await advance(300);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await pointer('pointerover');
  await advance(249);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await advance(1);
  expect(useSheetStore.getState().sheetOpenState).toBe(true);
});

it('opens on click immediately and cancels the pending timer', async () => {
  await pointer('pointerover');
  await act(async () => button().click());
  expect(useSheetStore.getState().sheetOpenState).toBe(true);
  await act(async () => useSheetStore.getState().setSheetOpenState(false));
  await advance(500);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
});

it('clears waiting when another entry opens the sheet or the trigger unmounts', async () => {
  await pointer('pointerover');
  await act(async () => useSheetStore.getState().setSheetOpenState(true));
  await act(async () => useSheetStore.getState().setSheetOpenState(false));
  await advance(500);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await pointer('pointerover');
  await act(async () => root.render(null));
  await advance(500);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
});

it('ignores touch hover and cancels interrupted pointers', async () => {
  await pointer('pointerover', 'touch');
  await advance(500);
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
  await pointer('pointerover');
  await pointer('pointercancel');
  await advance(500);
  expect(button().dataset.pending).toBe('false');
  expect(useSheetStore.getState().sheetOpenState).toBe(false);
});
