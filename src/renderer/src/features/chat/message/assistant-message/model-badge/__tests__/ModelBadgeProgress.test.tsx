// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelBadgeProgress } from '../ModelBadgeProgress';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ModelBadgeProgress', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
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
      await act(async () =>
        root.render(
          <div>
            <ModelBadgeProgress active={phase !== 'idle'} />
          </div>,
        ),
      );
    };
    await render('streaming');
    const svg = container.querySelector('.model-badge-progress')!;
    await render('idle');
    await act(async () => vi.advanceTimersByTime(100));
    await render('submitting');
    expect(container.querySelector('.model-badge-progress')).toBe(svg);
    expect(svg.getAttribute('data-active')).toBe('true');
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.querySelector('.model-badge-progress')).toBe(svg);
    await render('idle');
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.querySelector('.model-badge-progress')).toBeNull();
  });

  it('removes the comet immediately when reduced motion is preferred', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    let active = true;
    const render = async (): Promise<void> => {
      await act(async () =>
        root.render(
          <div>
            <ModelBadgeProgress active={active} />
          </div>,
        ),
      );
    };
    await render();
    expect(container.querySelector('.model-badge-progress')).not.toBeNull();
    active = false;
    await render();
    expect(container.querySelector('.model-badge-progress')).toBeNull();
  });

  it('tracks badge resizing and releases observation after fade-out', async () => {
    let resize!: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    let width = 160;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      () => width,
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(30);
    await act(async () =>
      root.render(
        <div>
          <ModelBadgeProgress active />
        </div>,
      ),
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('rect')).toHaveLength(48);
    expect(svg.querySelector('rect')?.getAttribute('width')).toBe('158');
    width = 240;
    await act(async () => resize([], {} as ResizeObserver));
    expect(svg.querySelector('rect')?.getAttribute('width')).toBe('238');
    await act(async () =>
      root.render(
        <div>
          <ModelBadgeProgress active={false} />
        </div>,
      ),
    );
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.querySelector('svg')).toBeNull();
    expect(disconnect).toHaveBeenCalled();
  });
});
