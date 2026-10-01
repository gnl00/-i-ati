// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMessageImages } from '../user-message-images';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const urls = Array.from(
  { length: 6 },
  (_, index) => `data:image/png;base64,image${index}`,
);

describe('User message image previews', () => {
  let container: HTMLDivElement;
  let root: Root;
  const button = (label: string): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const click = async (target: Element): Promise<void> => {
    await act(async () =>
      target.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
  };
  const render = async (images: string[]): Promise<void> => {
    await act(async () =>
      root.render(<UserMessageImages urls={images} isPending={false} />),
    );
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows four thumbnails and provides access to every original image', async () => {
    await render(urls);
    expect(container.querySelectorAll('button')).toHaveLength(4);
    const summary = button('View 3 more images');
    expect(summary.textContent).toContain('+3');
    await click(summary);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Image 4 of 6',
    );
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[3]);
    await click(button('Next image'));
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[4]);
    await click(button('Next image'));
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[5]);
    await click(button('Next image'));
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[0]);
  });

  it('supports arrow navigation and restores the activated thumbnail focus after Escape', async () => {
    await render(urls.slice(0, 3));
    const trigger = button('Open image 1 of 3');
    trigger.focus();
    await click(trigger);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      ),
    );
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe(urls[2]);
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      ),
    );
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe(urls[0]);
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('omits navigation for a single image and keeps its dimensions bounded', async () => {
    await render(urls.slice(0, 1));
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="user-message-images"]',
      )?.style.width,
    ).toBe('128px');
    await click(button('Open image 1 of 1'));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Image 1 of 1',
    );
    expect(
      document.querySelector('button[aria-label="Next image"]'),
    ).toBeNull();
    const close = [...document.querySelectorAll('button')].find(
      (element) => element.textContent === 'Close',
    )!;
    await click(close);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps failed images accessible and recovers when navigating to another source', async () => {
    await render(urls.slice(0, 2));
    const thumbImage = container.querySelector('img')!;
    await act(async () => thumbImage.dispatchEvent(new Event('error')));
    expect(container.textContent).toContain('Image unavailable');
    await click(button('Open image 1 of 2'));
    await act(async () =>
      document
        .querySelector('[role="dialog"] img')
        ?.dispatchEvent(new Event('error')),
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Image unavailable',
    );
    await click(
      document.querySelector('[role="dialog"] [role="img"] svg')!,
    );
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click(button('Next image'));
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[1]);
    expect(
      document.querySelector('[role="dialog"]')?.textContent,
    ).not.toContain('Image unavailable');
  });

  it.each(['image space', 'navigation space', 'header space', 'content space'])(
    'dismisses a single image from empty %s and restores focus',
    async (area) => {
      await render(urls.slice(0, 1));
      const trigger = button('Open image 1 of 1');
      await click(trigger);
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      const imageSpace = dialog.querySelector('img')!.parentElement!;
      const targets: Record<string, HTMLElement> = {
        'image space': imageSpace,
        'navigation space': imageSpace.parentElement!,
        'header space': dialog.querySelector('h2')!.parentElement!,
        'content space': dialog,
      };
      await click(targets[area]);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    },
  );

  it('keeps the image open when clicking the photo or navigation icons', async () => {
    await render(urls.slice(0, 2));
    await click(button('Open image 1 of 2'));
    await click(document.querySelector<HTMLElement>('[role="dialog"] img')!);
    await click(button('Next image').querySelector('svg')!);
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[1]);
    await click(button('Previous image').querySelector('svg')!);
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[0]);
  });
});
