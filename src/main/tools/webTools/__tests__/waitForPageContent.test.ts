import { afterEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { PAGE_CONTENT_SNAPSHOT_SCRIPT, waitForPageContent } from '../util/waitForPageContent'

afterEach(() => vi.useRealTimers())

describe('rendered page content readiness', () => {
  it('waits through an empty shell and changing content before accepting a short article', async () => {
    vi.useFakeTimers()
    let text = ''
    const webContents = { executeJavaScript: vi.fn(async () => text) }
    let ready = false
    const waiting = waitForPageContent(webContents, 8000).then(() => { ready = true })
    await vi.advanceTimersByTimeAsync(1200)
    expect(ready).toBe(false)
    text = 'First paragraph'
    await vi.advanceTimersByTimeAsync(600)
    text = 'First paragraph and second paragraph'
    await vi.advanceTimersByTimeAsync(900)
    expect(ready).toBe(false)
    await vi.advanceTimersByTimeAsync(300)
    await waiting
    expect(ready).toBe(true)
  })

  it('bounds an unresponsive renderer and observes cancellation', async () => {
    vi.useFakeTimers()
    const webContents = { executeJavaScript: vi.fn(() => new Promise<string>(() => {})) }
    const timedOut = expect(waitForPageContent(webContents, 8000)).rejects.toThrow('Timeout')
    await vi.advanceTimersByTimeAsync(8000)
    await timedOut
    const controller = new AbortController()
    const cancelled = expect(waitForPageContent(webContents, 8000, controller.signal)).rejects.toThrow('Aborted')
    controller.abort()
    await cancelled
  })

  it.each([
    ['<nav>Navigation</nav><main>Loading...</main>', ''],
    ['<main aria-busy="true">Partial article</main>', ''],
    ['<main><span role="progressbar">Working</span>Partial article</main>', ''],
    ['<main>Short article<button class="copybutton">Copied!</button><p>Copy instructions</p></main>', 'Short articleCopy instructions'],
    ['<main>Article<button aria-label="Copy code to clipboard" aria-busy="true"><span role="progressbar">Copying</span>Copied!</button></main>', 'Article'],
    ['<main><div class="language-js"><button class="copy copied" data-copied="Copied">Copied!</button><pre>const value = 42;</pre></div><div class="theme-doc-toc-mobile"><button class="clean-btn tocCollapsibleButton_TO0P">On this page</button></div></main>', 'const value = 42;'],
    ['<main>Article<button>Run example</button><button role="tab">JavaScript</button><button class="copy" data-copied="Copied">Copy example</button></main>', 'ArticleRun exampleJavaScriptCopy example'],
    ['<main aria-busy="true">Article<button aria-label="Copy code to clipboard">Copied!</button></main>', ''],
    ['<main>Short article<nav>Changing clock</nav><span hidden>Hidden</span><script>noise()</script></main>', 'Short article']
  ])('ignores loading and chrome in %s', async (html, expected) => {
    const window = new Window()
    try {
      window.document.body.innerHTML = html
      expect(window.eval(PAGE_CONTENT_SNAPSHOT_SCRIPT)).toBe(expected)
    } finally {
      await window.happyDOM.close()
    }
  })
})
