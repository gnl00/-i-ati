// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ModeToggleSlide } from '../ModeToggleSlide'
import { ThemeProvider } from '../../providers/ThemeProvider'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('ModeToggleSlide', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('light', 'dark')
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  const renderToggle = async (theme: 'light' | 'dark' | 'system'): Promise<HTMLButtonElement> => {
    localStorage.setItem('vite-ui-theme', theme)

    await act(async () => {
      root.render(
        <ThemeProvider>
          <ModeToggleSlide />
        </ThemeProvider>
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button')
    expect(button).not.toBeNull()
    return button!
  }

  const click = async (button: HTMLButtonElement, detail: number): Promise<void> => {
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))
    })
  }

  it('cycles light, dark, and system themes in order', async () => {
    const button = await renderToggle('light')

    expect(button.getAttribute('aria-label')).toBe('Theme: Light. Switch to Dark')
    expect(button.dataset.theme).toBe('light')

    await click(button, 1)
    expect(button.getAttribute('aria-label')).toBe('Theme: Dark. Switch to System')
    expect(button.dataset.theme).toBe('dark')
    expect(localStorage.getItem('vite-ui-theme')).toBe('dark')

    await click(button, 1)
    expect(button.getAttribute('aria-label')).toBe('Theme: System. Switch to Light')
    expect(button.dataset.theme).toBe('system')
    expect(localStorage.getItem('vite-ui-theme')).toBe('system')

    await click(button, 1)
    expect(button.getAttribute('aria-label')).toBe('Theme: Light. Switch to Dark')
    expect(button.dataset.theme).toBe('light')
    expect(localStorage.getItem('vite-ui-theme')).toBe('light')
  })

  it('positions semantic icons as a vertical reel', async () => {
    const button = await renderToggle('light')
    const lightIcon = button.querySelector<SVGElement>('[data-theme-icon="light"]')!
    const darkIcon = button.querySelector<SVGElement>('[data-theme-icon="dark"]')!
    const systemIcon = button.querySelector<SVGElement>('[data-theme-icon="system"]')!

    expect(lightIcon.getAttribute('class')).toContain('translate-y-0 opacity-100')
    expect(darkIcon.getAttribute('class')).toContain('translate-y-[125%] opacity-0')
    expect(systemIcon.getAttribute('class')).toContain('-translate-y-[125%] opacity-0')

    await click(button, 1)

    expect(lightIcon.getAttribute('class')).toContain('-translate-y-[125%] opacity-0')
    expect(darkIcon.getAttribute('class')).toContain('translate-y-0 opacity-100')
    expect(systemIcon.getAttribute('class')).toContain('translate-y-[125%] opacity-0')
    expect(darkIcon.getAttribute('class')).toContain('transition-[transform,opacity]')
  })

  it('updates keyboard-triggered changes without positional animation', async () => {
    const button = await renderToggle('light')

    await click(button, 1)
    const darkIcon = button.querySelector<SVGElement>('[data-theme-icon="dark"]')!
    expect(darkIcon.getAttribute('class')).toContain('transition-[transform,opacity]')

    await click(button, 0)
    const systemIcon = button.querySelector<SVGElement>('[data-theme-icon="system"]')!
    expect(systemIcon.getAttribute('class')).not.toContain('transition-[transform,opacity]')
    expect(systemIcon.getAttribute('class')).toContain('translate-y-0 opacity-100')
  })
})
