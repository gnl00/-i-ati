// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TrafficLights from '../traffic-lights'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('TrafficLights', () => {
  let container: HTMLDivElement
  let root: Root
  let electronDescriptor: PropertyDescriptor | undefined

  const setPlatform = (platform: NodeJS.Platform): void => {
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        process: { platform }
      }
    })
  }

  beforeEach(() => {
    electronDescriptor = Object.getOwnPropertyDescriptor(window, 'electron')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()

    if (electronDescriptor) {
      Object.defineProperty(window, 'electron', electronDescriptor)
    } else {
      delete (window as unknown as { electron?: Window['electron'] }).electron
    }
  })

  it('reserves the custom control width for native macOS traffic lights', async () => {
    setPlatform('darwin')
    const onClose = vi.fn()
    const onMinimize = vi.fn()
    const onMaximize = vi.fn()

    await act(async () => {
      root.render(
        <TrafficLights
          className="test-position"
          onClose={onClose}
          onMinimize={onMinimize}
          onMaximize={onMaximize}
        />
      )
    })

    const placeholder = container.querySelector<HTMLElement>('[data-native-traffic-lights="true"]')
    expect(placeholder).not.toBeNull()
    expect(placeholder?.className).toContain('w-[52px]')
    expect(placeholder?.className).toContain('test-position')
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('button')).toHaveLength(0)

    placeholder?.click()
    expect(onClose).not.toHaveBeenCalled()
    expect(onMinimize).not.toHaveBeenCalled()
    expect(onMaximize).not.toHaveBeenCalled()
  })

  it('renders custom controls and forwards callbacks on Windows', async () => {
    setPlatform('win32')
    const onClose = vi.fn()
    const onMinimize = vi.fn()
    const onMaximize = vi.fn()

    await act(async () => {
      root.render(
        <TrafficLights
          onClose={onClose}
          onMinimize={onMinimize}
          onMaximize={onMaximize}
        />
      )
    })

    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
    const minimize = container.querySelector<HTMLButtonElement>('button[aria-label="Minimize"]')
    const maximize = container.querySelector<HTMLButtonElement>('button[aria-label="Maximize"]')

    expect(close).not.toBeNull()
    expect(minimize).not.toBeNull()
    expect(maximize).not.toBeNull()
    expect(container.querySelector('[data-native-traffic-lights="true"]')).toBeNull()

    await act(async () => {
      close?.click()
      minimize?.click()
      maximize?.click()
    })

    expect(onClose).toHaveBeenCalledOnce()
    expect(onMinimize).toHaveBeenCalledOnce()
    expect(onMaximize).toHaveBeenCalledOnce()
  })
})
