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

  const render = async (status: ChatMessage['workStatus'] = 'completed'): Promise<HTMLButtonElement> => {
    await act(async () => root.render(
      <AssistantCompletedWorkGroup status={status} toolCount={4} forceReducedMotion>
        <button data-testid="child">Tool details</button>
      </AssistantCompletedWorkGroup>
    ))
    return container.querySelector<HTMLButtonElement>('button')!
  }

  it('keeps the same content mounted and collapses only on successful completion', async () => {
    const trigger = await render('running')
    const child = container.querySelector('[data-testid="child"]')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await render('running')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await render('completed')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-testid="child"]')).toBe(child)
    expect(container.textContent).toContain('4 tool calls')
    await act(async () => trigger.click())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await render('completed')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it.each(['failed', 'aborted', 'incomplete'] as const)('keeps %s work expanded', async status => {
    const trigger = await render(status)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it.each([[59, '59s'], [60, '1m'], [225, '3m45s'], [240, '4m']])(
    'shows completed work lasting %s seconds as %s', async (seconds, expected) => {
      await act(async () => root.render(
        <AssistantCompletedWorkGroup startedAt={1000} endedAt={1000 + Number(seconds) * 1000}>
          Work content
        </AssistantCompletedWorkGroup>
      ))
      expect(container.querySelector('button')!.textContent).toBe(`Work details${expected}`)
    }
  )

  it('respects a manual reopen during execution across completion', async () => {
    const trigger = await render('running')
    await act(async () => trigger.click())
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await act(async () => trigger.click())
    await render('completed')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps a focused tool detail visible on completion', async () => {
    const trigger = await render('running')
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="child"]')!.focus())
    await render('completed')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
  it('reveals a new failure even when running work was manually collapsed', async () => {
    const trigger = await render('running')
    await act(async () => trigger.click())
    await render('failed')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

})
