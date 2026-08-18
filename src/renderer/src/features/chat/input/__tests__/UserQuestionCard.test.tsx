// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingToolQuestion } from '@shared/tools/userQuestion'
import { UserQuestionCard, validateUserQuestionDraft } from '../UserQuestionCard'

function createRequest(overrides: Partial<PendingToolQuestion> = {}): PendingToolQuestion {
  return {
    submissionId: 'submission-1',
    chatUuid: 'chat-1',
    toolCallId: 'call-1',
    interactionId: 'interaction-1',
    questions: [
      {
        id: 'strategy',
        header: 'Select one approach',
        prompt: 'How should the migration proceed?',
        type: 'single_select',
        required: true,
        options: [
          { id: 'safe', label: 'Safe rollout', description: 'Use staged verification', recommended: true },
          { id: 'fast', label: 'Fast rollout' }
        ]
      },
      {
        id: 'notes',
        prompt: 'Add implementation notes',
        type: 'text',
        required: true,
        placeholder: 'Add context',
        maxLength: 80,
        recommendedText: 'Proceed with the staged rollout.'
      }
    ],
    timeoutMs: 60_000,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides
  }
}

describe('UserQuestionCard', () => {
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

  it('validates required selections and text', () => {
    const request = createRequest()
    expect(validateUserQuestionDraft(request.questions, {
      strategy: { optionIds: [], text: '' },
      notes: { optionIds: [], text: '' }
    })).toEqual({
      strategy: 'Choose an option',
      notes: 'Enter a response'
    })
  })

  it('renders recommendation and submits structured answers', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <UserQuestionCard
          request={createRequest()}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )
    })

    expect(container.textContent).toContain('Recommended')
    expect(container.textContent).toContain('Recommended choice in')

    const optionContainer = container.querySelector('[data-testid="user-question-options-strategy"]')
    expect(optionContainer).not.toBeNull()
    expect(optionContainer?.querySelectorAll('label')).toHaveLength(2)

    const recommendedOption = container.querySelector('[aria-label="Safe rollout"]') as HTMLButtonElement
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.className).toContain('focus-visible:bg-white')
    expect(textarea.className).toContain('dark:focus-visible:bg-slate-950/95')
    expect(textarea.className).not.toContain('focus-visible:ring-')
    await act(async () => {
      recommendedOption.click()
      const setTextareaValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set
      setTextareaValue?.call(textarea, 'Use the staged rollout with a smoke test.')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(recommendedOption.closest('label')?.dataset.selected).toBe('true')
    expect(recommendedOption.closest('label')?.className).toContain('bg-slate-100/80')
    expect(recommendedOption.className).toContain('checked:border-slate-700')
    const submitButton = [...container.querySelectorAll('button')]
      .find(button => button.textContent === 'Submit') as HTMLButtonElement
    await act(async () => submitButton.click())

    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'strategy', optionIds: ['safe'] },
      { questionId: 'notes', text: 'Use the staged rollout with a smoke test.' }
    ])
  })

  it('shows inline errors and keeps the form open', async () => {
    const onSubmit = vi.fn()
    await act(async () => {
      root.render(
        <UserQuestionCard
          request={createRequest()}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      )
    })

    const submitButton = [...container.querySelectorAll('button')]
      .find(button => button.textContent === 'Submit') as HTMLButtonElement
    await act(async () => submitButton.click())

    expect(container.textContent).toContain('Choose an option')
    expect(container.textContent).toContain('Enter a response')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
