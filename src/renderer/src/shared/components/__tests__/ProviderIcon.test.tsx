// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ProviderIcon } from '../ProviderIcon'
import { getProviderIconDescriptor } from '../../lib/providerIcons'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('ProviderIcon', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders brand assets as unfiltered images', async () => {
    await act(async () => {
      root.render(<ProviderIcon provider="kimi" alt="Kimi" className="h-6 w-6" />)
    })

    const icon = container.querySelector<HTMLImageElement>('img[data-provider-icon-appearance="brand"]')
    expect(icon).not.toBeNull()
    expect(icon?.src).toContain(getProviderIconDescriptor('kimi').src)
    expect(icon?.alt).toBe('Kimi')
    expect(icon?.className).not.toContain('grayscale')
    expect(icon?.className).not.toContain('invert')
  })

  it('renders monochrome assets as semantic-color masks', async () => {
    await act(async () => {
      root.render(<ProviderIcon provider="deepseek" alt="DeepSeek" className="h-5 w-5" />)
    })

    const icon = container.querySelector<HTMLElement>('[data-provider-icon-appearance="monochrome"]')
    expect(icon?.tagName).toBe('SPAN')
    expect(icon?.getAttribute('role')).toBe('img')
    expect(icon?.getAttribute('aria-label')).toBe('DeepSeek')
    expect(icon?.style.maskImage).toContain(getProviderIconDescriptor('deepseek').src)
    expect(icon?.className).toContain('dark:text-(--app-text-body)')
    expect(icon?.className).toContain('dark:group-hover:text-(--app-text-primary)')
  })

  it('uses separate disabled treatments for both render modes', async () => {
    await act(async () => {
      root.render(
        <>
          <ProviderIcon provider="zhipu" alt="Zhipu" disabled className="h-5 w-5" />
          <ProviderIcon provider="xiaomimimo" alt="Xiaomi" disabled className="h-5 w-5" />
        </>
      )
    })

    const brandIcon = container.querySelector<HTMLElement>('[data-provider-icon-appearance="brand"]')
    const monochromeIcon = container.querySelector<HTMLElement>('[data-provider-icon-appearance="monochrome"]')

    expect(brandIcon?.className).toContain('grayscale')
    expect(brandIcon?.className).toContain('opacity-45')
    expect(monochromeIcon?.className).toContain('dark:text-(--app-text-muted)')
    expect(monochromeIcon?.className).not.toContain('group-hover:text')
  })
})
