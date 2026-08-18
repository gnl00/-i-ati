import { afterEach, describe, expect, it, vi } from 'vitest'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { RunEventEmitter } from '../event-emitter'
import { ToolQuestionManager } from '../tool-question'

const question = {
  id: 'choice',
  prompt: 'Choose',
  type: 'single_select' as const,
  required: true,
  options: [
    { id: 'recommended', label: 'Recommended', recommended: true },
    { id: 'other', label: 'Other' }
  ],
  minSelections: 1,
  maxSelections: 1
}

const request = {
  toolCallId: 'call-1',
  interactionId: 'interaction-1',
  chatUuid: 'chat-1',
  questions: [question],
  timeoutMs: 100,
  recommendedAnswers: [{ questionId: 'choice', optionIds: ['recommended'] }]
}

const emitter = (emit = vi.fn()): RunEventEmitter => ({
  submissionId: 'submission-1',
  emit
} as unknown as RunEventEmitter)

afterEach(() => {
  vi.useRealTimers()
})

describe('ToolQuestionManager', () => {
  it('emits, hydrates and resolves a valid submitted answer', async () => {
    const manager = new ToolQuestionManager()
    const emit = vi.fn()
    const resultPromise = manager.request(emitter(emit), request)

    expect(emit).toHaveBeenCalledWith(
      RUN_TOOL_EVENTS.TOOL_USER_QUESTION_REQUIRED,
      expect.objectContaining({ interactionId: 'interaction-1', questions: [question] })
    )
    expect(manager.listPending('chat-1')).toEqual([
      expect.objectContaining({
        submissionId: 'submission-1',
        toolCallId: 'call-1',
        interactionId: 'interaction-1'
      })
    ])

    expect(manager.submit({
      action: 'submit',
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      toolCallId: 'call-1',
      interactionId: 'interaction-1',
      answers: [{ questionId: 'choice', optionIds: ['other'] }]
    })).toEqual({ ok: true })
    await expect(resultPromise).resolves.toEqual({
      status: 'submitted',
      interactionId: 'interaction-1',
      answers: [{ questionId: 'choice', optionIds: ['other'] }]
    })
    expect(manager.listPending('chat-1')).toEqual([])
    expect(emit).toHaveBeenCalledWith(
      RUN_TOOL_EVENTS.TOOL_USER_QUESTION_RESOLVED,
      expect.objectContaining({ status: 'submitted' })
    )
  })

  it('rejects malformed and duplicate submissions', async () => {
    const manager = new ToolQuestionManager()
    const resultPromise = manager.request(emitter(), request)
    const identity = {
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      toolCallId: 'call-1',
      interactionId: 'interaction-1'
    }

    expect(manager.submit({
      action: 'submit',
      ...identity,
      chatUuid: 'another-chat',
      answers: [{ questionId: 'choice', optionIds: ['recommended'] }]
    })).toEqual({ ok: false, reason: 'identity_mismatch' })

    expect(manager.submit({
      action: 'submit',
      ...identity,
      answers: [{ questionId: 'choice', optionIds: ['unknown'] }]
    })).toEqual(expect.objectContaining({ ok: false, reason: 'invalid_answers' }))
    expect(manager.submit({
      action: 'submit',
      ...identity,
      answers: [{ questionId: 'choice', optionIds: ['recommended'] }]
    })).toEqual({ ok: true })
    expect(manager.submit({
      action: 'submit',
      ...identity,
      answers: [{ questionId: 'choice', optionIds: ['recommended'] }]
    })).toEqual({ ok: false, reason: 'already_resolved' })
    await resultPromise
  })

  it('handles malformed IPC payloads without throwing', () => {
    const manager = new ToolQuestionManager()

    expect(manager.submit(undefined)).toEqual({
      ok: false,
      reason: 'identity_mismatch'
    })
  })

  it('auto-submits recommended answers at timeout', async () => {
    vi.useFakeTimers()
    const manager = new ToolQuestionManager()
    const resultPromise = manager.request(emitter(), request)

    await vi.advanceTimersByTimeAsync(100)

    await expect(resultPromise).resolves.toEqual({
      status: 'auto_submitted',
      interactionId: 'interaction-1',
      answers: [{ questionId: 'choice', optionIds: ['recommended'] }],
      reason: 'timeout_recommended_answers'
    })
  })

  it('resolves run cancellation as a model-visible cancelled result', async () => {
    const manager = new ToolQuestionManager()
    const resultPromise = manager.request(emitter(), request)

    manager.cancelForSubmission('submission-1')

    await expect(resultPromise).resolves.toEqual({
      status: 'cancelled',
      interactionId: 'interaction-1',
      reason: 'run_cancelled'
    })
  })
})
