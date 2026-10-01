// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('caret coordinate measurement', () => {
  let textarea: HTMLTextAreaElement;
  let getCaretCoordinates: typeof import('../caret-coords').getCaretCoordinates;
  let fontEvents: EventTarget;
  let originalFonts: PropertyDescriptor | undefined;
  let readTop: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    fontEvents = new EventTarget();
    Object.defineProperty(document, 'fonts', {
      value: fontEvents,
      configurable: true,
    });
    textarea = document.createElement('textarea');
    textarea.style.cssText =
      'width:320px;height:96px;font-size:14px;line-height:24px;border:0;padding:12px 16px';
    document.body.appendChild(textarea);
    readTop = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockReturnValue(12);
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(16);
    getCaretCoordinates = (await import('../caret-coords')).getCaretCoordinates;
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
  });

  it('reuses measurements when only scrolling changes', () => {
    textarea.value = 'Draft text';
    const first = getCaretCoordinates(textarea, 5);
    textarea.scrollTop = 24;
    textarea.scrollLeft = 10;
    expect(getCaretCoordinates(textarea, 5)).toEqual(first);
    expect(readTop).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached positions when font metrics finish loading', () => {
    textarea.value = 'Font preview';
    getCaretCoordinates(textarea, 4);
    fontEvents.dispatchEvent(new Event('loadingdone'));
    getCaretCoordinates(textarea, 4);
    expect(readTop).toHaveBeenCalledTimes(2);
  });

  it('protects the cache from a caller mutating returned coordinates', () => {
    textarea.value = 'abc';
    getCaretCoordinates(textarea, 2).left = 999;
    expect(getCaretCoordinates(textarea, 2).left).toBe(16);
    expect(readTop).toHaveBeenCalledTimes(1);
  });

  it('remeasures after text, selection or layout changes', () => {
    textarea.value = 'Draft text';
    getCaretCoordinates(textarea, 5);
    textarea.value += '!';
    getCaretCoordinates(textarea, 5);
    getCaretCoordinates(textarea, 6);
    textarea.style.width = '240px';
    getCaretCoordinates(textarea, 6);
    expect(readTop).toHaveBeenCalledTimes(4);
  });

  it('preserves mirror nodes across edits and treats Unicode offsets as UTF-16', () => {
    textarea.value = '中文🙂\n';
    getCaretCoordinates(textarea, 4);
    const span = document.querySelector('span')!;
    const prefix = span.previousSibling!;
    expect(prefix.textContent).toBe('中文🙂');
    textarea.value += 'Next line';
    getCaretCoordinates(textarea, 5);
    expect(document.querySelector('span')).toBe(span);
    expect(span.previousSibling).toBe(prefix);
    expect(prefix.textContent).toBe('中文🙂\n');
  });

  it('keeps debug measurements independent of the normal cache', () => {
    textarea.value = 'abc';
    const normal = getCaretCoordinates(textarea, 2);
    expect(getCaretCoordinates(textarea, 2, { debug: true })).toEqual(normal);
    expect(
      document.querySelector('#input-textarea-caret-position-mirror-div'),
    ).not.toBeNull();
    expect(getCaretCoordinates(textarea, 2)).toEqual(normal);
    expect(readTop).toHaveBeenCalledTimes(2);
  });
});
