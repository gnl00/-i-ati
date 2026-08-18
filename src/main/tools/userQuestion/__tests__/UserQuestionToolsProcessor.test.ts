import { describe, expect, it, vi } from 'vitest'
import {
  processAskUserQuestion,
  validateAskUserQuestionArgs
} from '../UserQuestionToolsProcessor'

const validArgs = {
  questions: [
    {
      id: 'approach',
      prompt: 'Choose an approach',
      type: 'single_select',
      required: true,
      options: [
        { id: 'safe', label: 'Safe', recommended: true },
        { id: 'fast', label: 'Fast' }
      ]
    }
  ],
  timeout_seconds: 60
}

describe('UserQuestionToolsProcessor', () => {
  it('normalizes questions and delegates the interaction to the run requester', async () => {
    const requestUserQuestion = vi.fn(async request => ({
      status: 'submitted' as const,
      interactionId: request.interactionId,
      answers: [{ questionId: 'approach', optionIds: ['fast'] }]
    }))

    const result = await processAskUserQuestion(validArgs, {
      toolCallId: 'call-1',
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      requestUserQuestion
    })

    expect(result.status).toBe('submitted')
    expect(requestUserQuestion).toHaveBeenCalledWith(expect.objectContaining({
      toolCallId: 'call-1',
      chatUuid: 'chat-1',
      timeoutMs: 60_000,
      recommendedAnswers: [{ questionId: 'approach', optionIds: ['safe'] }]
    }))
  })

  it('returns an unavailable model-visible result outside an interactive desktop run', async () => {
    await expect(processAskUserQuestion(validArgs)).resolves.toEqual({
      status: 'unavailable',
      reason: 'User questions are available in an active desktop chat run.'
    })
  })

  it('requires timeout recommendations for every required question', () => {
    const validation = validateAskUserQuestionArgs({
      questions: [{
        id: 'name',
        prompt: 'Enter a name',
        type: 'text',
        required: true
      }]
    })

    expect(validation).toEqual({
      valid: false,
      message: 'Required text question "name" needs recommended_text for timeout continuation'
    })
  })

  it('defaults the user input wait to one minute', () => {
    const validation = validateAskUserQuestionArgs({
      questions: validArgs.questions
    })

    expect(validation.valid).toBe(true)
    if (validation.valid) {
      expect(validation.timeoutMs).toBe(60_000)
    }
  })

  it('normalizes shorter user input waits to one minute', () => {
    const validation = validateAskUserQuestionArgs({
      ...validArgs,
      timeout_seconds: 20
    })

    expect(validation.valid).toBe(true)
    if (validation.valid) {
      expect(validation.timeoutMs).toBe(60_000)
    }
  })

  it('rejects duplicate question and option ids', () => {
    const validation = validateAskUserQuestionArgs({
      questions: [{
        id: 'choice',
        prompt: 'Choose',
        type: 'single_select',
        required: true,
        options: [
          { id: 'same', label: 'One', recommended: true },
          { id: 'same', label: 'Two' }
        ]
      }]
    })

    expect(validation.valid).toBe(false)
    if (!validation.valid) {
      expect(validation.message).toContain('Duplicate option id')
    }
  })

  it('requires at least one selection for required choice questions', () => {
    const validation = validateAskUserQuestionArgs({
      questions: [{
        id: 'choice',
        prompt: 'Choose',
        type: 'multi_select',
        required: true,
        min_selections: 0,
        options: [{ id: 'safe', label: 'Safe', recommended: true }]
      }]
    })

    expect(validation).toEqual({
      valid: false,
      message: 'questions.choice.min_selections must be an integer between 1 and 1'
    })
  })
})
