// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SharedPromptSurface from '../SharedPromptSurface';
import { ActiveSkillsSlot } from '../ActiveSkillsSlot';

vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: (selector: (state: { runPhase: string }) => unknown): unknown =>
    selector({ runPhase: 'idle' }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SharedPromptSurface text entry', () => {
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

  it.each(['chat', 'welcome'] as const)(
    'keeps %s text entry and native placeholder intact when attachments change',
    async (variant) => {
      const render = async (
        attached: boolean,
        value: string,
      ): Promise<void> => {
        await act(async () => {
          root.render(
            <SharedPromptSurface
              variant={variant}
              expanded
              value={value}
              onChange={() => {}}
              placeholder="Type anything to chat"
              mediaGallery={
                attached ? (
                  <img alt="Attachment" src="data:image/png;base64,AA==" />
                ) : null
              }
            />,
          );
        });
      };

      await render(false, '');
      const textarea = container.querySelector('textarea')!;
      expect(textarea.placeholder).toBe('Type anything to chat');
      expect(textarea.value).toBe('');
      await render(false, 'Draft text');
      textarea.focus();
      textarea.setSelectionRange(5, 5);

      for (const attached of [true, false]) {
        await render(attached, 'Draft text');
        expect(container.querySelector('textarea')).toBe(textarea);
        expect(document.activeElement).toBe(textarea);
        expect(textarea.value).toBe('Draft text');
        expect(textarea.selectionStart).toBe(5);
        expect(textarea.selectionEnd).toBe(5);
      }
    },
  );

  it.each(['chat', 'welcome'] as const)(
    'preserves %s text entry when the active skill slot appears and disappears',
    async (variant) => {
      const render = async (names: string[]): Promise<void> => {
        await act(async () => root.render(
          <SharedPromptSurface
            variant={variant}
            expanded
            value="Draft text"
            onChange={() => {}}
            skillSlot={names.length ? <ActiveSkillsSlot names={names} onDeactivate={vi.fn()} /> : null}
            mediaGallery={<img alt="Attachment" src="data:image/png;base64,AA==" />}
          />,
        ));
      };

      await render([]);
      const textarea = container.querySelector('textarea')!;
      textarea.focus();
      textarea.setSelectionRange(2, 7);
      for (const names of [['pdf'], ['pdf', 'documents'], []]) {
        await render(names);
        expect(container.querySelector('textarea')).toBe(textarea);
        expect(document.activeElement).toBe(textarea);
        expect(textarea.value).toBe('Draft text');
        expect(textarea.selectionStart).toBe(2);
        expect(textarea.selectionEnd).toBe(7);
        expect(container.querySelectorAll('[aria-label="Active skills"] li')).toHaveLength(names.length);
      }
    },
  );

  it.each(['chat', 'welcome'] as const)(
    'orders the %s queue, active skills, attachments and text entry',
    async (variant) => {
      await act(async () => root.render(
        <SharedPromptSurface
          variant={variant}
          expanded
          value="Draft text"
          onChange={() => {}}
          topAccessory={<div aria-label="Queued message">Queued task</div>}
          skillSlot={<ActiveSkillsSlot names={['pdf']} onDeactivate={vi.fn()} />}
          mediaGallery={<img alt="Image attachment" src="data:image/png;base64,AA==" />}
          textAttachmentGallery={<div aria-label="Text attachment">Report.txt</div>}
        />,
      ));
      const orderedContent = container.querySelectorAll(
        '[aria-label="Queued message"], [aria-label="Active skills"], img, [aria-label="Text attachment"], textarea',
      );
      expect(Array.from(orderedContent, node => node.getAttribute('aria-label') ?? node.getAttribute('alt'))).toEqual([
        'Queued message',
        'Active skills',
        'Image attachment',
        'Text attachment',
        'Ask @i what to work on...',
      ]);
    },
  );
});
