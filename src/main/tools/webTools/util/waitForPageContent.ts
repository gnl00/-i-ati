import type { WebContents } from 'electron'
import { waitForCondition } from './waitForCondition'
import { RENDERED_CONTROL_NOISE_SELECTOR } from './renderedControlSelectors'

// Observe content rather than navigation, clocks or other changing page chrome.
export const PAGE_CONTENT_SNAPSHOT_SCRIPT = `(() => {
  const candidates = [...document.querySelectorAll('article, main, [role="main"], [itemprop="articleBody"]')];
  const root = candidates.find(el => el.innerText?.trim()) || document.body;
  if (!root) return '';
  const copy = root.cloneNode(true);
  copy.querySelectorAll('script, style, noscript, nav, header, footer, aside, ${RENDERED_CONTROL_NOISE_SELECTOR}, [hidden], [aria-hidden="true"]').forEach(el => el.remove());
  const text = (copy.textContent || '').replace(/\\s+/g, ' ').trim();
  const busy = copy.matches('[aria-busy="true"]') || !!copy.querySelector('[aria-busy="true"], [role="progressbar"]');
  const loading = /^(loading(?:\\.{3}|…)?|please wait(?:\\.{3}|…)?|加载中(?:\\.{3}|…)?)[.!\\s]*$/i.test(text);
  return busy || loading ? '' : text;
})()`

/** A nonempty content snapshot must remain unchanged for 900 ms. */
export async function waitForPageContent(
  webContents: Pick<WebContents, 'executeJavaScript'>,
  timeout: number,
  signal?: AbortSignal
): Promise<void> {
  let previous = ''
  let changedAt = Date.now()
  await waitForCondition(async () => {
    const text: string = await webContents.executeJavaScript(PAGE_CONTENT_SNAPSHOT_SCRIPT)
    if (!text || text !== previous) {
      previous = text
      changedAt = Date.now()
      return false
    }
    return Date.now() - changedAt >= 900
  }, timeout, 300, signal)
}
