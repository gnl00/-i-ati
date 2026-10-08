// @vitest-environment happy-dom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommandPalette from '../CommandPalette';
import type { SlashCommand } from '../useSlashCommands';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const commands = [
  {
    cmd: '/clear',
    label: 'Clear Chat',
    description: 'Start a new chat',
    action: vi.fn(),
  },
  {
    cmd: '/clear-workspace',
    label: 'Clear Workspace',
    description: 'Return to the default workspace',
    action: vi.fn(),
  },
];

describe('CommandPalette', () => {
  let root: Root;
  let container: HTMLDivElement;
  let textarea: HTMLTextAreaElement;
  const ref = createRef<HTMLTextAreaElement>();
  const onCommandClick = vi.fn();
  let resizeCallback: ResizeObserverCallback;
  const disconnect = vi.fn();
  const rect = { top: 200, left: 40, width: 700 };

  const render = async (
    isOpen = true,
    selectedIndex = 0,
    items: SlashCommand[] = commands,
    emptyMessage?: string,
  ): Promise<void> => {
    await act(async () =>
      root.render(
        <CommandPalette
          isOpen={isOpen}
          commands={items}
          selectedIndex={selectedIndex}
          textareaRef={ref}
          onCommandClick={onCommandClick}
          emptyMessage={emptyMessage}
        />,
      ),
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    container = document.createElement('div');
    textarea = document.createElement('textarea');
    document.body.append(container, textarea);
    ref.current = textarea;
    vi.spyOn(textarea, 'getBoundingClientRect').mockImplementation(
      () => rect as DOMRect,
    );
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    textarea.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps input focus on pointer selection and dispatches the matching command', async () => {
    await render();
    textarea.focus();
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Slash commands"] button',
    );
    const mouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    buttons[1].dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(textarea);
    await act(async () => buttons[1].click());
    expect(onCommandClick).toHaveBeenCalledWith(commands[1]);
    expect(commands[1].action).not.toHaveBeenCalled();
  });

  it('announces the complete description and updates the current command', async () => {
    await render();
    expect(
      document.querySelector('button[aria-current="true"]')?.textContent,
    ).toContain('Clear Chat');
    await render(true, 1);
    const current = document.querySelector('button[aria-current="true"]');
    expect(current?.getAttribute('aria-label')).toContain(
      'Return to the default workspace',
    );
    expect(current?.textContent).toContain('/clear-workspace');
  });

  it('tracks textarea geometry on resize and releases its observer on close', async () => {
    await render();
    const panel = document.querySelector(
      '[aria-label="Slash commands"]',
    )?.parentElement;
    expect(panel?.style.width).toBe('700px');
    expect(panel?.style.top).toBe('190px');
    rect.width = 420;
    await act(async () => resizeCallback([], {} as ResizeObserver));
    expect(panel?.style.width).toBe('420px');
    await render(false);
    expect(document.querySelector('[aria-label="Slash commands"]')).toBeNull();
    expect(disconnect).toHaveBeenCalledOnce();
    rect.width = 700;
  });

  it('renders no panel for no matching commands', async () => {
    await render(true, 0, []);
    expect(document.querySelector('[aria-label="Slash commands"]')).toBeNull();
  });

  it('shows an accessible empty state for loading or failed skill discovery', async () => {
    await render(true, -1, [], 'Loading skills...');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Loading skills...');
    expect(document.querySelector('[aria-label="Slash commands"] button')).toBeNull();
    await render(true, -1, [], 'Failed to load skills');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Failed to load skills');
  });

  it('announces active skills without showing Enter on an unselected candidate', async () => {
    const skills = [
      { ...commands[0], cmd: '/sk:pdf', label: 'PDF', active: true },
      { ...commands[1], cmd: '/sk:other', label: 'Other' },
    ];
    await render(true, -1, skills);
    const button = document.querySelector('[aria-label="Slash commands"] button');
    expect(button?.textContent).toContain('Active');
    expect(button?.getAttribute('aria-label')).toContain(', Active');
    expect(button?.textContent).not.toContain('↵');
    expect(document.querySelector('button[aria-current="true"]')).toBeNull();
    expect(document.querySelector('[aria-label="Slash commands"]')?.textContent).not.toContain('↵');
    await render(true, 0, skills);
    expect(document.querySelector('button[aria-current="true"]')?.textContent).toContain('↵');
  });

  it('scrolls the selected row into view when keyboard selection changes', async () => {
    await render(true, -1);
    const button = document.querySelectorAll('[aria-label="Slash commands"] button')[1] as HTMLButtonElement;
    const scrollIntoView = vi.fn();
    button.scrollIntoView = scrollIntoView;
    await render(true, 1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
