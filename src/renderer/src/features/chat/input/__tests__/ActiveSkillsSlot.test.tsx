// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveSkillsSlot } from '../ActiveSkillsSlot';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ActiveSkillsSlot', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onDeactivate = vi.fn();

  const render = async (
    names: string[],
    chatUuid = 'chat-a',
    disabled = false,
  ): Promise<void> => {
    await act(async () =>
      root.render(<ActiveSkillsSlot key={chatUuid} names={names} onDeactivate={onDeactivate} disabled={disabled} />),
    );
  };

  beforeEach(() => {
    onDeactivate.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('omits the slot for an empty active set and displays complete skill names', async () => {
    await render([]);
    expect(container.childElementCount).toBe(0);

    const longName =
      'a-very-long-active-skill-name-that-needs-visual-truncation';
    await render(['pdf', longName]);
    expect(
      container.querySelector('[aria-label="Active skills"]'),
    ).not.toBeNull();
    const names = container.querySelectorAll('li');
    expect(Array.from(names, (name) => name.textContent)).toEqual([
      'pdf',
      longName,
    ]);
    expect(names[1].title).toBe(longName);
    expect(container.querySelector('button[aria-expanded]')).toBeNull();
  });

  it('reveals additional skills and collapses them while retaining keyboard focus', async () => {
    await render(['pdf', 'documents', 'read', 'write', 'think']);
    expect(
      Array.from(container.querySelectorAll('li'), (name) => name.textContent),
    ).toEqual(['pdf', 'documents', 'read']);

    const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(toggle.textContent).toBe('+2');
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls')!),
    ).not.toBeNull();

    toggle.focus();
    await act(async () => toggle.click());
    expect(container.querySelectorAll('li')).toHaveLength(5);
    expect(toggle.textContent).toBe('Show less');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(toggle);

    await act(async () => toggle.click());
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('keeps the textarea focused during pointer toggling and isolates the composer click', async () => {
    const onComposerClick = vi.fn();
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    try {
      await act(async () =>
        root.render(
          <div onClick={onComposerClick}>
            <ActiveSkillsSlot names={['pdf', 'documents', 'read', 'write']} onDeactivate={onDeactivate} />
          </div>,
        ),
      );
      textarea.value = 'draft text';
      textarea.focus();
      textarea.setSelectionRange(2, 5);
      const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
      const mouseDown = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      toggle.dispatchEvent(mouseDown);
      expect(mouseDown.defaultPrevented).toBe(true);
      await act(async () => toggle.click());
      expect(document.activeElement).toBe(textarea);
      const deactivate = container.querySelector<HTMLButtonElement>('[aria-label="Deactivate pdf"]')!;
      const deactivateMouseDown = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      deactivate.dispatchEvent(deactivateMouseDown);
      expect(deactivateMouseDown.defaultPrevented).toBe(true);
      await act(async () => deactivate.click());
      expect(onDeactivate).toHaveBeenCalledExactlyOnceWith('pdf');
      expect(document.activeElement).toBe(textarea);
      expect(textarea.value).toBe('draft text');
      expect(textarea.selectionStart).toBe(2);
      expect(textarea.selectionEnd).toBe(5);
      expect(onComposerClick).not.toHaveBeenCalled();
    } finally {
      textarea.remove();
    }
  });

  it('updates the active set and resets expansion when the chat key changes', async () => {
    await render(['pdf', 'documents', 'read', 'write']);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click(),
    );
    await render(['pdf', 'think', 'read', 'write', 'ui']);
    expect(
      Array.from(container.querySelectorAll('li'), (name) => name.textContent),
    ).toEqual(['pdf', 'think', 'read', 'write', 'ui']);

    await render(['pdf', 'think', 'read', 'write', 'ui'], 'chat-b');
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.querySelector('button[aria-expanded]')?.textContent).toBe('+2');
  });

  it('deactivates only through the explicit action and waits for names from its owner', async () => {
    onDeactivate.mockResolvedValueOnce(true);
    await render(['pdf', 'documents']);
    await act(async () => container.querySelector<HTMLSpanElement>('li span')!.click());
    expect(onDeactivate).not.toHaveBeenCalled();
    const deactivate = container.querySelector<HTMLButtonElement>('[aria-label="Deactivate documents"]')!;
    await act(async () => deactivate.click());
    expect(onDeactivate).toHaveBeenCalledExactlyOnceWith('documents');
    expect(Array.from(container.querySelectorAll('li'), name => name.textContent)).toEqual(['pdf', 'documents']);

    await render(['pdf']);
    expect(container.querySelector('[aria-label="Deactivate documents"]')).toBeNull();
  });

  it('keeps full names keyboard accessible and disables actions without disabling disclosure', async () => {
    const longName = 'a-very-long-active-skill-name-that-needs-visual-truncation';
    await render([longName, 'pdf', 'read', 'documents'], 'chat-a', true);
    let deactivate = container.querySelector<HTMLButtonElement>(`[aria-label="Deactivate ${longName}"]`)!;
    expect(deactivate.title).toBe(`Deactivate ${longName}`);
    expect(deactivate.disabled).toBe(true);
    await act(async () => deactivate.click());
    expect(onDeactivate).not.toHaveBeenCalled();
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(toggle.disabled).toBe(false);
    await act(async () => toggle.click());
    expect(container.querySelectorAll('li')).toHaveLength(4);

    await render([longName, 'pdf', 'read', 'documents']);
    deactivate = container.querySelector<HTMLButtonElement>(`[aria-label="Deactivate ${longName}"]`)!;
    expect(deactivate.disabled).toBe(false);
    expect(deactivate.tabIndex).toBe(0);
    deactivate.focus();
    expect(document.activeElement).toBe(deactivate);
    await act(async () => deactivate.click());
    expect(onDeactivate).toHaveBeenCalledExactlyOnceWith(longName);
    expect(document.activeElement).toBe(deactivate);
  });
});
