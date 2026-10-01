// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatImageGallery from '../ChatImageGallery'

const store = vi.hoisted(() => ({
  imageSrcBase64List: [] as ClipbordImg[],
  setImageSrcBase64List: vi.fn(),
}))
vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: (select: (state: typeof store) => unknown): unknown => select(store),
}))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const urls = Array.from({ length: 6 }, (_, index) => `image-${index}.png`)

describe('Composer image attachments use the shared viewer', () => {
  let root: Root
  let container: HTMLDivElement
  let parentClick: ReturnType<typeof vi.fn<() => void>>
  const button = (label: string): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  const click = async (target: HTMLElement, pointer = false): Promise<void> => {
    await act(async () =>
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: pointer ? 1 : 0 }),
      ),
    )
  }
  const render = async (images: ClipbordImg[] = urls): Promise<void> => {
    store.imageSrcBase64List = images
    await act(async () =>
      root.render(
        <div onClick={parentClick}>
          <ChatImageGallery />
        </div>,
      ),
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    parentClick = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens attachments, navigates every image and restores the current thumbnail focus without changing the draft', async () => {
    await render()
    await click(button('Open image 2 of 6'))
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[1])
    await click(button('Next image'))
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[2])
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      ),
    )
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe(urls[1])
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button('Open image 2 of 6')),
    )
    expect(store.setImageSrcBase64List).not.toHaveBeenCalled()
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('removes an attachment without opening a preview or activating the composer parent', async () => {
    await render()
    await click(button('Remove image 2'))
    expect(store.setImageSrcBase64List).toHaveBeenCalledWith([
      urls[0],
      ...urls.slice(2),
    ])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('dismisses from empty viewer space without changing attachments or activating the composer parent', async () => {
    await render()
    await click(button('Open image 2 of 6'))
    await click(
      document.querySelector('[role="dialog"] img')!.parentElement!,
      true,
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button('Open image 2 of 6')),
    )
    expect(store.setImageSrcBase64List).not.toHaveBeenCalled()
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('ignores non-string clipboard values and preserves the original removal index', async () => {
    await render([null, urls[0], new ArrayBuffer(0), urls[1]])
    expect(container.querySelectorAll('img')).toHaveLength(2)
    await click(button('Remove image 2'))
    expect(store.setImageSrcBase64List).toHaveBeenCalledWith([
      null,
      urls[0],
      new ArrayBuffer(0),
    ])
  })

  it('dismisses a stale preview when attachments are replaced or cleared', async () => {
    await render()
    await click(button('Open image 1 of 6'))
    await render([urls[1]])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await click(button('Open image 1 of 1'))
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute('src'),
    ).toBe(urls[1])
    await render([])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('returns the fifth attachment to its own thumbnail and fades if horizontally clipped', async () => {
    const animations: { frames: Keyframe[]; duration: number }[] = []
    const completions: (() => void)[] = []
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('innerHeight', 768)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(
      1000,
    )
    vi.spyOn(
      HTMLImageElement.prototype,
      'naturalHeight',
      'get',
    ).mockReturnValue(500)
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
      true,
    )
    vi.spyOn(
      HTMLImageElement.prototype,
      'getBoundingClientRect',
    ).mockImplementation(function (this: HTMLImageElement): DOMRect {
      return this.closest('[role="dialog"]')
        ? new DOMRect(100, 100, 800, 400)
        : new DOMRect(204, 500, 88, 88)
    })
    const animate = vi.fn(function (
      this: HTMLElement,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      if (this.tagName === 'IMG')
        animations.push({ frames, duration: Number(options.duration) })
      const finished = new Promise<void>((resolve) => completions.push(resolve))
      return { finished, cancel: vi.fn() } as unknown as Animation
    })
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    })
    try {
      await render()
      const gallery = container.querySelector<HTMLElement>(
        '[aria-label="Image attachments"]',
      )!
      let right = 800
      gallery.getBoundingClientRect = (): DOMRect => new DOMRect(0, 400, right, 250)
      await click(button('Open image 5 of 6'), true)
      await act(async () => completions.forEach((finish) => finish()))
      await click(button('Close'), true)
      expect(animations.at(-1)).toEqual({
        duration: 180,
        frames: [
          { transform: 'none', opacity: '1' },
          { transform: 'translate(104px, 422px) scale(0.11)', opacity: 1 },
        ],
      })
      await act(async () => completions.forEach((finish) => finish()))
      await click(button('Open image 5 of 6'), true)
      await act(async () => completions.forEach((finish) => finish()))
      right = 250
      await click(button('Close'), true)
      expect(animations.at(-1)?.duration).toBe(120)
      expect(animations.at(-1)?.frames[1]).toMatchObject({
        transform: 'none',
        opacity: 0,
      })
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate
    }
  })
})
