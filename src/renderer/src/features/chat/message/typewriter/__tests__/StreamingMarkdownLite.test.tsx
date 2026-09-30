// @vitest-environment happy-dom

import { act, type ComponentProps, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fluidRender = vi.hoisted(() => vi.fn())
vi.mock('../FluidTypewriterText', () => ({
  FluidTypewriterText: (props: { content: string }): ReactElement => {
    fluidRender(props)
    return <span>{props.content}</span>
  }
}))

import { StreamingMarkdownLite } from '../StreamingMarkdownLite'

describe('StreamingMarkdownLite', () => {
  let container: HTMLDivElement
  let root: Root
  const render = async (
    text: string,
    props: Partial<ComponentProps<typeof StreamingMarkdownLite>> = {}
  ): Promise<void> => {
    await act(async () =>
      root.render(
        <StreamingMarkdownLite
          text={text}
          perfSessionId="session"
          perfSegmentId="segment"
          {...props}
        />
      )
    )
  }

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    fluidRender.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('keeps completed blocks idle as the streaming tail grows', async () => {
    const prefix =
      '# Stable heading\n\nStable `inline` paragraph\n\n- Stable item\n\n> Stable quote\n\n```ts\nconst stable = 1\n```\n\n'
    await render(prefix + 'Tail')
    const heading = container.querySelector('h1')
    const list = container.querySelector('ul')
    const code = container.querySelector('pre')
    const initialStableRenders = fluidRender.mock.calls.filter(([props]) =>
      props.content.startsWith('Stable')
    ).length

    for (let index = 0; index < 20; index += 1) {
      await render(prefix + `Tail ${'x'.repeat(index + 1)}`)
    }

    expect(
      fluidRender.mock.calls.filter(([props]) =>
        props.content.startsWith('Stable')
      )
    ).toHaveLength(initialStableRenders)
    expect(container.querySelector('h1')).toBe(heading)
    expect(container.querySelector('ul')).toBe(list)
    expect(container.querySelector('pre')).toBe(code)
    expect(
      container.querySelector('[data-mode=lite] > p:last-child')?.textContent
    ).toBe(`Tail ${'x'.repeat(20)}`)
    expect(container.querySelector('p code')?.textContent).toBe('inline')
  })

  it('updates growing lists and quotes and replaces the structure on non-append edits', async () => {
    await render('- one')
    await render('- one\n- two')
    expect(
      Array.from(container.querySelectorAll('li')).map(
        (node) => node.textContent
      )
    ).toEqual(['one', 'two'])
    await render('> one')
    await render('> one\n> two')
    expect(
      Array.from(container.querySelectorAll('blockquote p')).map(
        (node) => node.textContent
      )
    ).toEqual(['one', 'two'])
    await render('plain paragraph')
    expect(container.querySelector('blockquote')).toBeNull()
    expect(container.querySelector('p')?.textContent).toBe('plain paragraph')
    await render('1. replaced')
    expect(container.querySelector('ol li')?.textContent).toBe('replaced')
    expect(container.querySelector('ul')).toBeNull()
  })

  it('completes a partial fence and renders the following paragraph', async () => {
    await render('``')
    expect(container.querySelector('pre')).toBeNull()
    await render('```ts\nconst a = 1')
    const code = container.querySelector('pre')
    expect(code?.textContent).toBe('const a = 1')
    await render('```ts\nconst a = 1\n```\n\nAfter code')
    expect(container.querySelector('pre')).toBe(code)
    expect(container.querySelector('pre')?.textContent).toBe('const a = 1')
    expect(container.querySelector('p')?.textContent).toBe('After code')
  })

  it('propagates animation and performance context changes to stable blocks', async () => {
    const text = '# Stable heading\n\nTail'
    await render(text)
    fluidRender.mockClear()
    await render(text, { animate: false })
    expect(fluidRender).not.toHaveBeenCalled()
    expect(container.querySelector('h1')?.textContent).toBe('Stable heading')
    await render(text, {
      animationWindow: 9,
      perfSessionId: 'new-session',
      perfMode: 'switch'
    })
    expect(fluidRender).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Stable heading',
        animationWindow: 9,
        perfSessionId: 'new-session',
        perfMode: 'switch'
      })
    )
  })
})
