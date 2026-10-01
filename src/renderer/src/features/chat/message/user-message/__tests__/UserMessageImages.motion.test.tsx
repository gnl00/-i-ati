// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMessageImages } from '../user-message-images';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type RecordedAnimation = {
  node: HTMLElement;
  frames: Keyframe[];
  duration: number;
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
};

describe('Image preview spatial transitions', () => {
  let container: HTMLDivElement;
  let root: Root;
  let animations: RecordedAnimation[];
  let sourceTop: number;
  let reduced: boolean;
  const button = (label: string): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const pointerClick = async (target: HTMLElement): Promise<void> => {
    await act(async () =>
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      ),
    );
  };
  const imageAnimations = (): RecordedAnimation[] =>
    animations.filter((entry) => entry.node.tagName === 'IMG');
  const render = async (): Promise<void> => {
    await act(async () =>
      root.render(
        <UserMessageImages
          urls={Array.from({ length: 6 }, (_, index) => `image-${index}.png`)}
          isPending={false}
        />,
      ),
    );
  };
  const finishAll = async (): Promise<void> => {
    await act(async () => animations.forEach((entry) => entry.finish()));
  };

  beforeEach(() => {
    animations = [];
    sourceTop = 500;
    reduced = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: reduced,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(
      1000,
    );
    vi.spyOn(
      HTMLImageElement.prototype,
      'naturalHeight',
      'get',
    ).mockReturnValue(500);
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
      true,
    );
    vi.spyOn(
      HTMLImageElement.prototype,
      'getBoundingClientRect',
    ).mockImplementation(function (this: HTMLImageElement) {
      const index = Number(this.alt.split(' ')[1]) - 1;
      return this.closest('[role="dialog"]')
        ? new DOMRect(100, 100, 800, 400)
        : new DOMRect(100 + index * 104, sourceTop, 88, 88);
    });
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    vi.stubGlobal('Animation', class {});
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: vi.fn(function (
        this: HTMLElement,
        frames: Keyframe[],
        options: KeyframeAnimationOptions,
      ) {
        let finish!: () => void;
        const finished = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const cancel = vi.fn();
        animations.push({
          node: this,
          frames,
          duration: Number(options.duration),
          cancel,
          finish,
        });
        return { finished, cancel } as unknown as Animation;
      }),
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('expands the contained pixels with uniform scale and remeasures the source on close', async () => {
    await render();
    await pointerClick(button('Open image 2 of 6'));
    expect(imageAnimations()[0]).toMatchObject({
      duration: 220,
      frames: [
        { transform: 'translate(104px, 422px) scale(0.11)', opacity: 1 },
        { transform: 'none', opacity: 1 },
      ],
    });
    await finishAll();
    sourceTop = 400;
    await pointerClick(button('Close'));
    expect(imageAnimations().at(-1)).toMatchObject({ duration: 180 });
    expect(imageAnimations().at(-1)?.frames[1]).toMatchObject({
      transform: 'translate(104px, 322px) scale(0.11)',
      opacity: 1,
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await finishAll();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button('Open image 2 of 6')),
    );
  });

  it('continues from the rendered position when closing during entry', async () => {
    await render();
    await pointerClick(button('Open image 1 of 6'));
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) =>
        element.matches('[role="dialog"] img')
          ? ({
              transform: 'matrix(0.5, 0, 0, 0.5, 0, 220)',
              opacity: '1',
            } as CSSStyleDeclaration)
          : original(element, pseudo),
    );
    await pointerClick(button('Close'));
    expect(imageAnimations()[0].cancel).toHaveBeenCalled();
    expect(imageAnimations().at(-1)?.frames[0]).toMatchObject({
      transform: 'matrix(0.5, 0, 0, 0.5, 0, 220)',
    });
    await finishAll();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('returns to the current thumbnail when clicking empty space inside the viewer', async () => {
    await render();
    await pointerClick(button('Open image 2 of 6'));
    await finishAll();
    await pointerClick(
      document.querySelector('[role="dialog"] img')!.parentElement!,
    );
    expect(imageAnimations().at(-1)).toMatchObject({
      duration: 180,
      frames: [
        { transform: 'none', opacity: '1' },
        { transform: 'translate(104px, 422px) scale(0.11)', opacity: 1 },
      ],
    });
    expect(
      document.querySelector('[role="dialog"]')?.getAttribute('data-phase'),
    ).toBe('closing');
    await finishAll();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button('Open image 2 of 6')),
    );
  });

  it('switches within the viewer and returns hidden images to the summary tile', async () => {
    await render();
    await pointerClick(button('View 3 more images'));
    await finishAll();
    await pointerClick(button('Next image'));
    expect(imageAnimations().at(-1)).toMatchObject({
      duration: 120,
      frames: [{ opacity: 0 }, { opacity: 1 }],
    });
    await pointerClick(button('Close'));
    expect(imageAnimations().at(-1)?.frames[1]).toMatchObject({
      transform: 'translate(312px, 422px) scale(0.11)',
      opacity: 0,
    });
    await finishAll();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button('View 3 more images')),
    );
  });

  it('fades when the return thumbnail is outside the viewport', async () => {
    await render();
    await pointerClick(button('Open image 1 of 6'));
    await finishAll();
    sourceTop = -100;
    await pointerClick(button('Close'));
    expect(imageAnimations().at(-1)).toMatchObject({ duration: 120 });
    expect(imageAnimations().at(-1)?.frames[1]).toMatchObject({
      transform: 'none',
      opacity: 0,
    });
  });

  it('fades when the transcript top overlay covers the return thumbnail', async () => {
    const viewport = document.createElement('div');
    viewport.dataset.slot = 'message-scroller-viewport';
    viewport.getBoundingClientRect = (): DOMRect =>
      new DOMRect(0, 0, 1024, 768);
    document.body.appendChild(viewport);
    viewport.appendChild(container);
    container.dataset.slot = 'message-scroller-item';
    try {
      await render();
      await pointerClick(button('Open image 1 of 6'));
      await finishAll();
      container.style.scrollMarginBlockStart = '560px';
      await pointerClick(button('Close'));
      expect(imageAnimations().at(-1)).toMatchObject({ duration: 120 });
      expect(imageAnimations().at(-1)?.frames[1]).toMatchObject({
        transform: 'none',
        opacity: 0,
      });
    } finally {
      viewport.replaceWith(container);
    }
  });

  it('uses immediate state changes for keyboard and reduced motion', async () => {
    await render();
    await act(async () => button('Open image 1 of 6').click());
    await act(async () => button('Close').click());
    expect(animations).toHaveLength(0);
    reduced = true;
    await pointerClick(button('Open image 1 of 6'));
    await pointerClick(button('Close'));
    expect(animations).toHaveLength(0);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('cancels animations on resize and ignores stale completion', async () => {
    await render();
    await pointerClick(button('Open image 1 of 6'));
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(
      animations.every((entry) => entry.cancel.mock.calls.length > 0),
    ).toBe(true);
    await act(async () => button('Close').click());
    await finishAll();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('settles immediately when WAAPI is unavailable', async () => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    await render();
    await pointerClick(button('Open image 1 of 6'));
    expect(
      document.querySelector('[role="dialog"]')?.getAttribute('data-phase'),
    ).toBe('open');
    await pointerClick(button('Close'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('animates a delayed image load after the overlay has finished', async () => {
    const complete = vi
      .spyOn(HTMLImageElement.prototype, 'complete', 'get')
      .mockReturnValue(false);
    await render();
    await pointerClick(button('Open image 1 of 6'));
    expect(imageAnimations()).toHaveLength(0);
    await finishAll();
    complete.mockReturnValue(true);
    await act(async () =>
      document
        .querySelector('[role="dialog"] img')!
        .dispatchEvent(new Event('load')),
    );
    expect(imageAnimations().at(-1)).toMatchObject({ duration: 220 });
  });

  it('cancels every animation on unmount and ignores late completion', async () => {
    await render();
    await pointerClick(button('Open image 1 of 6'));
    await act(async () => root.unmount());
    expect(
      animations.every((entry) => entry.cancel.mock.calls.length > 0),
    ).toBe(true);
    await finishAll();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    root = createRoot(container);
  });
});
