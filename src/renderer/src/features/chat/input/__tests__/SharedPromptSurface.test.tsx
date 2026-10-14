// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SharedPromptSurface from '../SharedPromptSurface';
import { ActiveSkillsSlot } from '../ActiveSkillsSlot';

const runState = vi.hoisted(() => ({ runPhase: 'idle' }));

vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: (selector: (state: { runPhase: string }) => unknown): unknown =>
    selector(runState),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SharedPromptSurface text entry', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    runState.runPhase = 'idle';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('cancels fade-out removal when another run starts and preserves the same orbit', async () => {
    const render = async (phase: string): Promise<void> => {
      runState.runPhase = phase;
      await act(async () => root.render(<SharedPromptSurface value="Draft" onChange={() => {}} />));
    };
    await render('streaming');
    const svg = container.querySelector('.shared-prompt-progress')!;
    await render('idle');
    await act(async () => vi.advanceTimersByTime(100));
    await render('submitting');
    expect(container.querySelector('.shared-prompt-progress')).toBe(svg);
    expect(svg.getAttribute('data-active')).toBe('true');
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.querySelector('.shared-prompt-progress')).toBe(svg);
    await render('idle');
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.querySelector('.shared-prompt-progress')).toBeNull();
  });

  it('removes the comet immediately when reduced motion is preferred', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    runState.runPhase = 'streaming';
    const render = async (): Promise<void> => {
      await act(async () => root.render(<SharedPromptSurface value="Draft" onChange={() => {}} />));
    };
    await render();
    expect(container.querySelector('.shared-prompt-progress')).not.toBeNull();
    runState.runPhase = 'idle';
    await render();
    expect(container.querySelector('.shared-prompt-progress')).toBeNull();
  });

  it.each(['chat', 'welcome'] as const)(
    'follows the whole %s surface during a run and releases observation when idle',
    async variant => {
      let resize!: ResizeObserverCallback;
      const observe = vi.fn();
      const disconnect = vi.fn();
      vi.stubGlobal('ResizeObserver', class {
        constructor(callback: ResizeObserverCallback) { resize = callback; }
        observe = observe;
        disconnect = disconnect;
      });
      let width = 620;
      let height = 140;
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
      const render = async (phase: string, queued = false): Promise<void> => {
        runState.runPhase = phase;
        await act(async () => root.render(
          <SharedPromptSurface
            variant={variant}
            expanded
            value="Draft text"
            onChange={() => {}}
            topAccessory={queued ? <div>Queued task</div> : null}
          />
        ));
      };
      await render('idle');
      expect(container.querySelector('.shared-prompt-progress')).toBeNull();
      await render('submitting');
      const svg = container.querySelector('.shared-prompt-progress')!;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(observe).toHaveBeenCalledWith(svg.parentElement);
      const edge = svg.querySelector('rect')!;
      expect(edge.getAttribute('width')).toBe('618');
      expect(edge.getAttribute('height')).toBe('138');
      const textarea = container.querySelector('textarea')!;
      textarea.focus();
      textarea.setSelectionRange(2, 7);
      height = 172;
      await render('streaming', true);
      await act(async () => resize([], {} as ResizeObserver));
      expect(container.querySelector('.shared-prompt-progress')).toBe(svg);
      expect(edge.getAttribute('height')).toBe('170');
      width = 380;
      height = 284;
      await act(async () => resize([], {} as ResizeObserver));
      expect(edge.getAttribute('width')).toBe('378');
      expect(edge.getAttribute('height')).toBe('282');
      expect(container.querySelector('textarea')).toBe(textarea);
      expect(document.activeElement).toBe(textarea);
      expect(textarea.selectionStart).toBe(2);
      expect(textarea.selectionEnd).toBe(7);
      await render('idle');
      expect(container.querySelector('.shared-prompt-progress')).toBe(svg);
      expect(svg.getAttribute('data-active')).toBe('false');
      await act(async () => vi.advanceTimersByTime(179));
      expect(disconnect).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTime(1));
      expect(container.querySelector('.shared-prompt-progress')).toBeNull();
      expect(disconnect).toHaveBeenCalledOnce();
    }
  );

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
