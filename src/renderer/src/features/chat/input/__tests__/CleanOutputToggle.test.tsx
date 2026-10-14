// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CleanOutputToggle } from '../toolbar/CleanOutputToggle';
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@renderer/infrastructure/config/appConfig', async () => {
  const { create } = await import('zustand');
  const useAppConfigStore = create((set, get) => ({
    appConfig: { version: 1, cleanOutput: false },
    getAppConfig: (): IAppConfig =>
      (get() as { appConfig: IAppConfig }).appConfig,
    setAppConfig: vi.fn(async (appConfig: IAppConfig) => {
      set({ appConfig });
    }),
  }));
  return { useAppConfigStore };
});

describe('clean output toggle', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    useAppConfigStore.setState({
      appConfig: { version: 1, cleanOutput: false },
    });
    vi.mocked(useAppConfigStore.getState().setAppConfig).mockClear();
    toastError.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('uses an icon-only accessible pressed button and saves both toggle directions', async () => {
    await act(async () => root.render(<CleanOutputToggle />));
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Clean output');
    expect(button.textContent).toBe('');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await act(async () => button.click());
    expect(useAppConfigStore.getState().setAppConfig).toHaveBeenLastCalledWith({
      version: 1,
      cleanOutput: true,
    });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button.click());
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('blocks repeat clicks until saving completes and preserves keyboard focus', async () => {
    let completeSave!: () => void;
    vi.mocked(useAppConfigStore.getState().setAppConfig).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeSave = resolve;
        }),
    );
    await act(async () =>
      root.render(<CleanOutputToggle variant="baseline" />),
    );
    const button = container.querySelector('button')!;
    await act(async () => button.focus());
    await act(async () => {
      button.click();
      button.click();
    });
    expect(useAppConfigStore.getState().setAppConfig).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await act(async () => completeSave());
    expect(button.disabled).toBe(false);
    await act(async () => button.focus());
    expect(document.activeElement).toBe(button);
  });

  it('preserves the previous mode and reports a failed save', async () => {
    vi.mocked(useAppConfigStore.getState().setAppConfig).mockRejectedValueOnce(
      new Error('Save failed'),
    );
    await act(async () => root.render(<CleanOutputToggle />));
    const button = container.querySelector('button')!;
    await act(async () => button.click());
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.disabled).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      'Could not save clean output preference',
    );
  });
});
