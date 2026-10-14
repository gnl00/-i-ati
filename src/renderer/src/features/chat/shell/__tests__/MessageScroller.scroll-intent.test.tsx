// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageScroller } from '@shadcn/react/message-scroller';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('installed MessageScroller manual scrolling', () => {
  let container: HTMLDivElement;
  let root: Root;
  let viewport: HTMLDivElement;
  let content: HTMLDivElement;
  let contentHeight: number;
  let scrollTo: ReturnType<typeof vi.fn>;
  let resizeObservers: Array<{ target?: Element; callback: () => void }>;
  let animationFrames: Map<number, FrameRequestCallback>;

  beforeEach(async () => {
    vi.useFakeTimers();
    resizeObservers = [];
    animationFrames = new Map();
    let nextFrameId = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        record: (typeof resizeObservers)[number];
        constructor(callback: () => void) {
          this.record = { callback };
          resizeObservers.push(this.record);
        }
        observe(target: Element) {
          this.record.target = target;
        }
        unobserve() {
          /* The fixture has one target per observer. */
        }
        disconnect() {
          /* Observers are discarded with the fixture. */
        }
      },
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextFrameId;
      animationFrames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      animationFrames.delete(id);
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <MessageScroller.Provider autoScroll scrollEdgeThreshold={80}>
          <MessageScroller.Root>
            <MessageScroller.Viewport>
              <MessageScroller.Content>
                <MessageScroller.Item messageId="answer">
                  Completed answer
                </MessageScroller.Item>
              </MessageScroller.Content>
            </MessageScroller.Viewport>
            <MessageScroller.Button behavior="auto">
              Scroll to latest
            </MessageScroller.Button>
          </MessageScroller.Root>
        </MessageScroller.Provider>,
      ),
    );
    viewport = container.querySelector('[role="region"]')!;
    content = container.querySelector('[role="log"]')!;
    const item = container.querySelector<HTMLElement>(
      '[data-message-id="answer"]',
    )!;
    contentHeight = 1000;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, get: () => contentHeight },
    });
    vi.spyOn(viewport, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: 0,
          bottom: 500,
          height: 500,
        }) as DOMRect,
    );
    vi.spyOn(item, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: -viewport.scrollTop,
          bottom: contentHeight - viewport.scrollTop,
          height: contentHeight,
        }) as DOMRect,
    );
    scrollTo = vi.fn((options: ScrollToOptions) => {
      viewport.scrollTop = options.top ?? 0;
    });
    viewport.scrollTo = scrollTo as typeof viewport.scrollTo;
    await scroll(500);
    await act(async () => vi.advanceTimersByTime(200));
    scrollTo.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const scroll = async (top: number) => {
    viewport.scrollTop = top;
    await act(async () =>
      viewport.dispatchEvent(new Event('scroll', { bubbles: true })),
    );
  };

  const intent = async (event: Event) => {
    await act(async () => viewport.dispatchEvent(event));
  };

  const resizeContent = async (growth = 0) => {
    contentHeight += growth;
    await act(async () =>
      resizeObservers
        .find((observer) => observer.target === content)!
        .callback(),
    );
  };

  const flushFrames = async () => {
    const frames = [...animationFrames.values()];
    animationFrames.clear();
    await act(async () =>
      frames.forEach((callback) => callback(performance.now())),
    );
  };

  it.each([1, 20, 79, 81, 100])(
    'preserves a %i px upward wheel scroll across resize and content growth',
    async (distance) => {
      await intent(
        new WheelEvent('wheel', { deltaY: -distance, bubbles: true }),
      );
      await scroll(500 - distance);
      await resizeContent();
      await resizeContent(30);
      await flushFrames();
      await resizeContent();
      expect(scrollTo).not.toHaveBeenCalled();
      expect(viewport.scrollTop).toBe(500 - distance);
    },
  );

  it('retains wheel intent when a state commit happens before the native scroll event', async () => {
    await intent(new WheelEvent('wheel', { deltaY: -2, bubbles: true }));
    await scroll(500);
    await flushFrames();
    await resizeContent(20);
    expect(viewport.scrollTop).toBe(500);
    expect(scrollTo).not.toHaveBeenCalled();
    await scroll(498);
    await resizeContent();
    expect(viewport.scrollTop).toBe(498);
  });

  it.each(['keyboard', 'touch'])(
    'releases following on %s input',
    async (input) => {
      await intent(
        input === 'keyboard'
          ? new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
          : new Event('touchmove', { bubbles: true }),
      );
      await scroll(498);
      await resizeContent(20);
      expect(viewport.scrollTop).toBe(498);
      expect(scrollTo).not.toHaveBeenCalled();
    },
  );

  it('releases following on an upward scrollbar scroll within the button threshold', async () => {
    await scroll(499);
    await resizeContent(20);
    expect(viewport.scrollTop).toBe(499);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('resumes following only after scrolling down to the actual bottom', async () => {
    await intent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    await scroll(400);
    await intent(new WheelEvent('wheel', { deltaY: 80, bubbles: true }));
    await scroll(480);
    await resizeContent();
    expect(viewport.scrollTop).toBe(480);
    expect(scrollTo).not.toHaveBeenCalled();
    await scroll(500);
    await resizeContent(20);
    expect(viewport.scrollTop).toBe(520);
    expect(scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'auto' });
  });

  it('restores following through Scroll to latest and allows immediate interruption', async () => {
    await intent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    await scroll(400);
    const button = container.querySelector<HTMLButtonElement>('button')!;
    expect(button.dataset.active).toBe('true');
    await act(async () => button.click());
    expect(viewport.scrollTop).toBe(500);
    await resizeContent(20);
    expect(viewport.scrollTop).toBe(520);
    scrollTo.mockClear();
    await intent(new WheelEvent('wheel', { deltaY: -2, bubbles: true }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'instant' });
    scrollTo.mockClear();
    expect(viewport.hasAttribute('data-autoscrolling')).toBe(false);
    await scroll(518);
    await flushFrames();
    await act(async () => vi.advanceTimersByTime(200));
    await resizeContent(20);
    expect(viewport.scrollTop).toBe(518);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it.each([0.25, 0.5])(
    'recovers after a %f px downward movement to the bottom',
    async (distance) => {
      await intent(
        new WheelEvent('wheel', { deltaY: -distance, bubbles: true }),
      );
      await scroll(500 - distance);
      await intent(
        new WheelEvent('wheel', { deltaY: distance, bubbles: true }),
      );
      await scroll(500);
      await resizeContent(20);
      expect(viewport.scrollTop).toBe(520);
      expect(scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'auto' });
    },
  );

  it('keeps recovered following when content shrink clamps the viewport at the bottom', async () => {
    await intent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    await scroll(400);
    await intent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    await scroll(500);
    // Chromium can clamp scrollTop when content-visibility changes row geometry.
    contentHeight -= 20;
    await scroll(480);
    await resizeContent(20);
    expect(viewport.scrollTop).toBe(500);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'auto' });
  });

  it.each(['wheel', 'keyboard'])(
    'keeps following on downward %s input at the bottom without a scroll event',
    async (input) => {
      await intent(
        input === 'wheel'
          ? new WheelEvent('wheel', { deltaY: 2, bubbles: true })
          : new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      await resizeContent(20);
      expect(viewport.scrollTop).toBe(520);
      expect(scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'auto' });
    },
  );

  it('continues following content growth without manual input', async () => {
    await resizeContent(20);
    expect(viewport.scrollTop).toBe(520);
    expect(scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'auto' });
  });
});
