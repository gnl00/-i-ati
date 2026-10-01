// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomCaretOverlay } from '../CustomCaretOverlay';
import { getCaretCoordinates } from '@renderer/shared/lib/caret-coords';

vi.mock('@renderer/shared/lib/caret-coords', () => ({
  getCaretCoordinates: vi.fn((textarea: HTMLTextAreaElement): object => ({
    left: 16 + textarea.selectionEnd * 8,
    top: 12,
    height: 24,
    fontSize: 14,
  })),
}));

const originalAnimate = HTMLElement.prototype.animate;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CustomCaretOverlay updates', () => {
  let container: HTMLDivElement;
  let textarea: HTMLTextAreaElement;
  let root: Root;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let cancellations: (() => void)[];
  let animations: { element: HTMLElement; animation: Animation }[];

  const flushFrame = (): void => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  };
  const caret = (): HTMLElement => container.querySelector('.custom-caret')!;
  const type = (length: number): void => {
    textarea.value = 'i'.repeat(length);
    textarea.setSelectionRange(length, length);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushFrame();
  };

  beforeEach(async () => {
    frames = new Map();
    nextFrame = 0;
    cancellations = [];
    animations = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      frames.delete(id);
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          /* Resize notifications are explicit in these tests. */
        }
        disconnect(): void {
          /* No native observer is allocated. */
        }
      },
    );
    HTMLElement.prototype.animate = vi.fn(function (
      this: HTMLElement,
    ): Animation {
      const animation = {
        onfinish: null,
        oncancel: null,
        cancel: (): void => {
          const callback = animation.oncancel;
          if (callback) {
            cancellations.push(() =>
              callback.call(
                animation,
                new Event('cancel') as AnimationPlaybackEvent,
              ),
            );
          }
        },
      } as unknown as Animation;
      animations.push({ element: this, animation });
      return animation;
    });
    container = document.createElement('div');
    textarea = document.createElement('textarea');
    const mount = document.createElement('div');
    container.append(textarea, mount);
    document.body.appendChild(container);
    root = createRoot(mount);
    await act(async () =>
      root.render(<CustomCaretOverlay textareaRef={{ current: textarea }} />),
    );
    vi.mocked(getCaretCoordinates).mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    if (originalAnimate) HTMLElement.prototype.animate = originalAnimate;
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    vi.unstubAllGlobals();
  });

  it('positions the caret in the first frame after focus', () => {
    textarea.focus();
    flushFrame();
    expect(caret().style.transform).toBe('translate3d(16px, 12.5px, 0)');
    expect(getCaretCoordinates).toHaveBeenCalledTimes(1);
  });

  it('merges input, selection and scroll updates in one frame', () => {
    textarea.focus();
    flushFrame();
    flushFrame();
    vi.mocked(getCaretCoordinates).mockClear();
    textarea.value = 'abc';
    textarea.setSelectionRange(3, 3);
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('selectionchange'));
    flushFrame();
    expect(getCaretCoordinates).toHaveBeenCalledTimes(1);
    expect(caret().style.transform).toBe('translate3d(40px, 12.5px, 0)');
  });

  it('refreshes resize geometry in the next frame', () => {
    textarea.focus();
    flushFrame();
    flushFrame();
    vi.mocked(getCaretCoordinates).mockClear();
    window.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(getCaretCoordinates).toHaveBeenCalledTimes(1);
  });

  it('keeps a reused trail visible when an older cancellation arrives', () => {
    textarea.focus();
    flushFrame();
    flushFrame();
    for (let i = 1; i <= 9; i++) type(i);
    const newestTrail = animations.at(-1)!.element.parentElement!;
    expect(cancellations.length).toBeGreaterThan(0);
    cancellations.splice(0).forEach((callback) => callback());
    expect(newestTrail.style.opacity).toBe('1');
  });

  it('keeps position feedback while skipping trails for reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    textarea.focus();
    flushFrame();
    type(3);
    expect(caret().style.transform).toBe('translate3d(40px, 12.5px, 0)');
    expect(animations).toHaveLength(0);
  });

  it('reuses the oldest active trails in order and cancels them on unmount', async () => {
    textarea.focus();
    flushFrame();
    flushFrame();
    for (let i = 1; i <= 10; i++) type(i);
    expect(animations[8].element).toBe(animations[0].element);
    expect(animations[9].element).toBe(animations[1].element);
    const cancel = vi.spyOn(animations.at(-1)!.animation, 'cancel');
    await act(async () => root.unmount());
    expect(cancel).toHaveBeenCalledOnce();
  });
});
