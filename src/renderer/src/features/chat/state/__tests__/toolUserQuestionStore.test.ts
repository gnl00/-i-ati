import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeRunToolUserQuestionListPending = vi.fn()
const invokeRunToolUserQuestionSubmit = vi.fn()

vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeRunToolUserQuestionListPending: (data: unknown) => invokeRunToolUserQuestionListPending(data),
  invokeRunToolUserQuestionSubmit: (data: unknown) => invokeRunToolUserQuestionSubmit(data)
}))

import { useToolUserQuestionStore } from '../toolUserQuestionStore'
import type { PendingToolQuestion } from '@shared/tools/userQuestion'

function createPending(overrides: Partial<PendingToolQuestion> = {}): PendingToolQuestion {
  return {
    submissionId: 'submission-1',
    chatUuid: 'chat-1',
    toolCallId: 'call-1',
    interactionId: 'interaction-1',
    questions: [{
      id: 'strategy',
      prompt: 'Choose a strategy',
      type: 'single_select',
      required: true,
      options: [
        { id: 'safe', label: 'Safe', recommended: true },
        { id: 'fast', label: 'Fast' }
      ]
    }],
    timeoutMs: 60_000,
    createdAt: 1_000,
    expiresAt: 61_000,
    ...overrides
  }
}

describe('toolUserQuestionStore', () => {
  beforeEach(() => {
    invokeRunToolUserQuestionListPending.mockReset()
    invokeRunToolUserQuestionSubmit.mockReset()
    useToolUserQuestionStore.setState({
      pendingRequests: [],
      hydratingChatUuid: null
    })
  })

  it('hydrates and deduplicates pending questions by interaction identity', async () => {
    const pending = createPending()
    invokeRunToolUserQuestionListPending.mockResolvedValue({ questions: [pending] })

    await useToolUserQuestionStore.getState().hydrate('chat-1')
    useToolUserQuestionStore.getState().enqueue({
      ...pending,
      expiresAt: 90_000
    })

    expect(invokeRunToolUserQuestionListPending).toHaveBeenCalledWith({ chatUuid: 'chat-1' })
    expect(useToolUserQuestionStore.getState().pendingRequests).toEqual([
      expect.objectContaining({ interactionId: 'interaction-1', expiresAt: 90_000 })
    ])
  })

  it('submits answers with the full interaction identity', async () => {
    const pending = createPending()
    invokeRunToolUserQuestionSubmit.mockResolvedValue({ ok: true })
    useToolUserQuestionStore.getState().enqueue(pending)

    const result = await useToolUserQuestionStore.getState().submit(pending, [{
      questionId: 'strategy',
      optionIds: ['safe']
    }])

    expect(result).toEqual({ ok: true })
    expect(invokeRunToolUserQuestionSubmit).toHaveBeenCalledWith({
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      toolCallId: 'call-1',
      interactionId: 'interaction-1',
      action: 'submit',
      answers: [{ questionId: 'strategy', optionIds: ['safe'] }]
    })
    expect(useToolUserQuestionStore.getState().pendingRequests).toEqual([])
  })

  it('routes cancellation through the paired question interaction', async () => {
    const pending = createPending()
    invokeRunToolUserQuestionSubmit.mockResolvedValue({ ok: true })
    useToolUserQuestionStore.getState().enqueue(pending)

    await useToolUserQuestionStore.getState().cancel(pending, 'user_cancelled')

    expect(invokeRunToolUserQuestionSubmit).toHaveBeenCalledWith({
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      toolCallId: 'call-1',
      interactionId: 'interaction-1',
      action: 'cancel',
      reason: 'user_cancelled'
    })
    expect(useToolUserQuestionStore.getState().pendingRequests).toEqual([])
  })

  it('keeps the card available when answer validation fails in main', async () => {
    const pending = createPending()
    invokeRunToolUserQuestionSubmit.mockResolvedValue({
      ok: false,
      reason: 'invalid_answers',
      message: 'Choose an option'
    })
    useToolUserQuestionStore.getState().enqueue(pending)

    await useToolUserQuestionStore.getState().submit(pending, [])

    expect(useToolUserQuestionStore.getState().pendingRequests).toEqual([pending])
  })
})
