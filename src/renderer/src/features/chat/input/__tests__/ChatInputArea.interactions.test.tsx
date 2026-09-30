// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ModelOption } from '@renderer/shared/config/modelTypes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  const state = {
    imageSrcBase64List: [],
    messages: [],
    runPhase: 'idle',
    postRunJobs: { title: 'idle', compression: 'idle' },
    currentChatUuid: null,
    currentChatId: null,
    chatList: [],
    permissionApprovalMode: 'manual',
    setImageSrcBase64List: noop,
    ensureSelectedModelRef: noop,
    setSelectedThinkingLevel: noop,
    setSelectedModelRef: noop,
    setPermissionApprovalMode: noop,
    editUserInstructionDraft: noop,
    prependChatListEntry: noop,
    selectChatShell: noop,
    updateWorkspacePath: noop,
  };
  return {
    state,
    noop,
    modelOptions: [{
      account: { id: 'test-account', label: 'Test provider', providerId: 'test', apiUrl: '', apiKey: '', models: [] },
      definition: { id: 'test', displayName: 'Test provider', adapterPluginId: 'test-adapter' },
      model: { id: 'test-model', label: 'Test model', type: 'llm' }
    }] as ModelOption[],
    selectDirectory: vi.fn().mockResolvedValue({ success: false }),
  };
});
vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    {
      getState: (): typeof mocks.state => mocks.state,
    },
  ),
}));
vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (): object => ({
    getModelOptions: (): ModelOption[] => mocks.modelOptions,
    resolveModelRef: (): undefined => undefined,
    plugins: [],
  }),
}));
vi.mock('@renderer/features/settings', () => ({
  useMcpConnection: (): object => ({
    syncWithConfig: mocks.noop,
    hydrateFromRuntime: mocks.noop,
  }),
}));
vi.mock('@renderer/features/chat/runtime/useChatRun', () => ({
  default: (): object => ({
    onSubmit: mocks.noop,
    cancel: mocks.noop,
    steer: mocks.noop,
  }),
  getActiveChatRunIdentity: (): null => null,
}));
vi.mock('../useSlashCommands', () => ({
  useSlashCommands: (): object => ({
    startNewChat: mocks.noop,
    filteredCommands: [],
    handleInputChange: mocks.noop,
    handleBlur: mocks.noop,
  }),
}));
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeSelectDirectory: mocks.selectDirectory,
}));
vi.mock('../../common/CustomCaretOverlay', () => ({
  CustomCaretOverlay: (): null => null,
}));
import ChatInputArea from '../ChatInputArea';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Welcome composer interaction boundaries', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onFocus = vi.fn();
  const parentClick = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <div onClick={parentClick}>
          <ChatInputArea
            welcomeVisualMode
            onWelcomeFocusStateChange={onFocus}
          />
        </div>,
      );
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('activates Welcome feedback only for textarea focus while toolbar focus keeps the panel expanded', async () => {
    const textarea = container.querySelector('textarea')!;
    const workspace = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Workspace',
    )!;
    await act(async () => textarea.focus());
    expect(onFocus).toHaveBeenLastCalledWith(true);
    await act(async () => workspace.focus());
    expect(onFocus).toHaveBeenLastCalledWith(false);
    expect(
      container.querySelector('#inputArea')?.getAttribute('data-expanded'),
    ).toBe('true');
    await act(async () => workspace.click());
    expect(mocks.selectDirectory).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
    await act(async () => workspace.blur());
    expect(
      container.querySelector('#inputArea')?.getAttribute('data-expanded'),
    ).toBe('false');
    await act(async () => textarea.click());
    expect(parentClick).toHaveBeenCalledOnce();
  });

  for (const label of ['Permission approval mode', 'combobox']) {
    it(`keeps ${label} open and restores trigger focus without activating Welcome feedback`, async () => {
      const trigger =
        label === 'combobox'
          ? container.querySelector<HTMLButtonElement>('[role="combobox"]')!
          : container.querySelector<HTMLButtonElement>(
              `[aria-label="${label}"]`,
            )!;
      await act(async () =>
        trigger.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
        ),
      );
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(
        container.querySelector('#inputArea')?.getAttribute('data-expanded'),
      ).toBe('true');
      const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
      await act(async () => menu.click());
      expect(parentClick).not.toHaveBeenCalled();
      await act(async () =>
        menu.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 160));
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
      expect(onFocus).not.toHaveBeenLastCalledWith(true);
      expect(
        container.querySelector('#inputArea')?.getAttribute('data-expanded'),
      ).toBe('true');
    });
  }

  for (const label of ['Permission approval mode', 'combobox']) {
    for (const closeWith of ['Escape', 'trigger', 'selection'] as const) {
      it(`keeps ${label} expanded throughout exit animation and focus restoration via ${closeWith}`, async () => {
        const getStyles = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
          const styles = getStyles(element, pseudo);
          if (element.getAttribute('role') !== 'menu') return styles;
          return new Proxy(styles, {
            get(target, property): unknown {
              if (property === 'animationName') return element.getAttribute('data-state') === 'open' ? 'enter' : 'exit';
              return Reflect.get(target, property);
            }
          });
        });
        const trigger = label === 'combobox'
          ? container.querySelector<HTMLButtonElement>('[role="combobox"]')!
          : container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
        await act(async () => trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        expect(menu).not.toBeNull();
        const frame = container.querySelector<HTMLElement>('#inputArea')!;
        const states: string[] = [];
        const observer = new MutationObserver(records => {
          states.push(...records.map(record => record.oldValue ?? ''));
        });
        observer.observe(frame, { attributes: true, attributeFilter: ['data-expanded'], attributeOldValue: true });
        try {
          await act(async () => {
            if (closeWith === 'Escape') menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            else if (closeWith === 'trigger') trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
            else menu.querySelector<HTMLElement>(label === 'combobox' ? '[role="menuitem"]' : '[role="menuitemradio"]')!.click();
          });
          expect(menu.dataset.state).toBe('closed');
          // The menu remains mounted beyond the former 120ms hold timeout.
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
          expect(menu.isConnected).toBe(true);
          expect(frame.dataset.expanded).toBe('true');
          await act(async () => menu.dispatchEvent(Object.assign(new Event('animationend', { bubbles: true }), { animationName: 'exit' })));
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
          expect(menu.isConnected).toBe(false);
          expect(document.activeElement).toBe(trigger);
          expect(frame.dataset.expanded).toBe('true');
          expect(states).not.toContain('false');
          expect(onFocus).not.toHaveBeenLastCalledWith(true);
          // Releasing the hold must still allow an empty composer to collapse after blur.
          await act(async () => trigger.blur());
          expect(frame.dataset.expanded).toBe('false');
        } finally {
          observer.disconnect();
        }
      });
    }
  }

  it('does not submit or pass action-row clicks to ancestors when Send is disabled', async () => {
    const send = container.querySelector<HTMLButtonElement>('button:disabled')!;
    expect(send).not.toBeNull();
    await act(async () => send.click());
    expect(mocks.noop).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.anything(),
    );
    await act(async () =>
      container
        .querySelector<HTMLElement>('.shared-prompt-baseline-right')!
        .click(),
    );
    expect(parentClick).not.toHaveBeenCalled();
  });
});
