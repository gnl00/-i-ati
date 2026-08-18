// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AssistantCompletedWorkGroup } from '../renderers/AssistantCompletedWorkGroup'

describe('AssistantCompletedWorkGroup', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders a collapsed full-width completed-work disclosure', async () => {
    await act(async () => {
      root.render(
        <AssistantCompletedWorkGroup forceReducedMotion>
          <div data-testid="completed-work-child">Reasoning and tool calls</div>
        </AssistantCompletedWorkGroup>
      )
    })

    const group = container.querySelector('[data-testid="assistant-completed-work-group"]')
    const trigger = container.querySelector<HTMLButtonElement>('button')
    const panel = container.querySelector('[data-testid="completed-work-panel"]')
    const header = container.querySelector('[data-testid="support-segment-header"]')

    expect(group?.classList.contains('w-full')).toBe(true)
    expect(group?.classList.contains('px-2')).toBe(false)
    expect(trigger?.classList.contains('w-full')).toBe(true)
    expect(trigger?.getAttribute('aria-label')).toBe('Expand completed work')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(trigger?.getAttribute('aria-controls')).toBe(panel?.id)
    expect(trigger?.classList.contains('rounded-[10px]')).toBe(true)
    expect(trigger?.classList.contains('overflow-hidden')).toBe(true)
    expect(trigger?.classList.contains('border')).toBe(true)
    expect(trigger?.classList.contains('border-b')).toBe(false)
    expect(trigger?.classList.contains('px-2')).toBe(true)
    expect(trigger?.classList.contains('dark:bg-(--chat-surface)')).toBe(true)
    expect(panel?.getAttribute('data-state')).toBe('collapsed')
    expect(panel?.classList.contains('transition-none')).toBe(true)
    expect(header?.querySelector('[data-testid="completed-work-label"]')?.textContent)
      .toBe('Work completed')
    expect(header?.querySelector('[data-testid="completed-work-icon"] svg')
      ?.classList.contains('lucide-list-checks')).toBe(true)
    expect(header?.querySelector('[data-testid="completed-work-description"]')).toBeNull()
    expect(header?.querySelector('[data-testid="completed-work-duration"]')).toBeNull()
    expect(container.querySelector('[data-testid="completed-work-child"]')).not.toBeNull()
  })

  it('expands and collapses while retaining the mounted support content', async () => {
    await act(async () => {
      root.render(
        <AssistantCompletedWorkGroup>
          <div data-testid="completed-work-child">Reasoning and tool calls</div>
        </AssistantCompletedWorkGroup>
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>('button')
    const child = container.querySelector('[data-testid="completed-work-child"]')

    await act(async () => trigger?.click())
    expect(trigger?.getAttribute('aria-label')).toBe('Collapse completed work')
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(trigger?.classList.contains('dark:bg-(--chat-surface-raised)')).toBe(true)
    expect(container.querySelector('[data-testid="completed-work-panel"]')?.getAttribute('data-state'))
      .toBe('expanded')

    await act(async () => trigger?.click())
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-testid="completed-work-child"]')).toBe(child)
  })
})
