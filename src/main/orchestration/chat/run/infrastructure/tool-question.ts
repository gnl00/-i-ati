import type { ToolQuestionRequest } from '@main/agent/contracts'
import type {
  PendingToolQuestion,
  ToolUserQuestion,
  ToolUserQuestionAnswer,
  ToolUserQuestionSubmitResult,
  ToolUserQuestionToolResult
} from '@shared/tools/userQuestion'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { RunEventEmitter } from './event-emitter'

type PendingQuestion = {
  descriptor: PendingToolQuestion
  emitter: RunEventEmitter
  questions: ToolUserQuestion[]
  promise: Promise<ToolUserQuestionToolResult>
  resolve: (result: ToolUserQuestionToolResult) => void
  timeoutId: NodeJS.Timeout
}

const MAX_RESOLVED_IDENTITIES = 500

function validateAnswers(
  questions: ToolUserQuestion[],
  answers: ToolUserQuestionAnswer[]
): string | undefined {
  if (!Array.isArray(answers)) return 'answers must be an array'
  const questionById = new Map(questions.map(question => [question.id, question]))
  const answerByQuestionId = new Map<string, ToolUserQuestionAnswer>()

  for (const answer of answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
      return 'Each answer must be an object'
    }
    if (typeof answer.questionId !== 'string' || !questionById.has(answer.questionId)) {
      return `Unknown question id: ${String(answer.questionId)}`
    }
    if (answerByQuestionId.has(answer.questionId)) {
      return `Duplicate answer for question: ${answer.questionId}`
    }
    answerByQuestionId.set(answer.questionId, answer)
  }

  for (const question of questions) {
    const answer = answerByQuestionId.get(question.id)
    if (!answer) {
      if (question.required) return `Missing required answer: ${question.id}`
      continue
    }

    if (question.type === 'text') {
      if (answer.optionIds !== undefined) return `Text question ${question.id} cannot use optionIds`
      if (typeof answer.text !== 'string') return `Text answer ${question.id} must be a string`
      if (question.required && answer.text.trim().length === 0) {
        return `Text answer ${question.id} is required`
      }
      if (answer.text.length > (question.maxLength ?? 2000)) {
        return `Text answer ${question.id} exceeds its maximum length`
      }
      continue
    }

    if (answer.text !== undefined) return `Selection question ${question.id} cannot use text`
    if (!Array.isArray(answer.optionIds)) return `Selection answer ${question.id} needs optionIds`
    const uniqueOptionIds = new Set(answer.optionIds)
    if (uniqueOptionIds.size !== answer.optionIds.length) {
      return `Selection answer ${question.id} contains duplicate option ids`
    }
    const validOptionIds = new Set(question.options?.map(option => option.id) ?? [])
    const unknownOptionId = answer.optionIds.find(optionId => !validOptionIds.has(optionId))
    if (unknownOptionId) return `Unknown option id ${unknownOptionId} for question ${question.id}`
    const minimum = question.minSelections ?? (question.required ? 1 : 0)
    const maximum = question.type === 'single_select' ? 1 : (question.maxSelections ?? validOptionIds.size)
    if (answer.optionIds.length < minimum || answer.optionIds.length > maximum) {
      return `Selection answer ${question.id} requires ${minimum}-${maximum} options`
    }
  }
  return undefined
}

export class ToolQuestionManager {
  private readonly pending = new Map<string, PendingQuestion>()
  private readonly resolvedIdentities = new Set<string>()

  async request(
    emitter: RunEventEmitter,
    request: ToolQuestionRequest
  ): Promise<ToolUserQuestionToolResult> {
    const key = this.key(emitter.submissionId, request.toolCallId, request.interactionId)
    const existing = this.pending.get(key)
    if (existing) return existing.promise

    const createdAt = Date.now()
    const descriptor: PendingToolQuestion = {
      submissionId: emitter.submissionId,
      chatUuid: request.chatUuid,
      toolCallId: request.toolCallId,
      interactionId: request.interactionId,
      questions: request.questions,
      timeoutMs: request.timeoutMs,
      createdAt,
      expiresAt: createdAt + request.timeoutMs
    }
    let resolvePromise!: (result: ToolUserQuestionToolResult) => void
    const promise = new Promise<ToolUserQuestionToolResult>((resolve) => {
      resolvePromise = resolve
    })
    const timeoutId = setTimeout(() => {
      this.resolvePending(key, {
        status: 'auto_submitted',
        interactionId: request.interactionId,
        answers: request.recommendedAnswers,
        reason: 'timeout_recommended_answers'
      })
    }, request.timeoutMs)

    this.pending.set(key, {
      descriptor,
      emitter,
      questions: request.questions,
      promise,
      resolve: resolvePromise,
      timeoutId
    })
    emitter.emit(RUN_TOOL_EVENTS.TOOL_USER_QUESTION_REQUIRED, {
      toolCallId: descriptor.toolCallId,
      interactionId: descriptor.interactionId,
      questions: descriptor.questions,
      timeoutMs: descriptor.timeoutMs,
      createdAt: descriptor.createdAt,
      expiresAt: descriptor.expiresAt
    })
    return promise
  }

  submit(rawRequest: unknown): ToolUserQuestionSubmitResult {
    if (
      !rawRequest
      || typeof rawRequest !== 'object'
      || Array.isArray(rawRequest)
    ) {
      return { ok: false, reason: 'identity_mismatch' }
    }
    const request = rawRequest as Record<string, unknown>
    if (
      typeof request.submissionId !== 'string'
      || request.submissionId.length === 0
      || typeof request.chatUuid !== 'string'
      || request.chatUuid.length === 0
      || typeof request.toolCallId !== 'string'
      || request.toolCallId.length === 0
      || typeof request.interactionId !== 'string'
      || request.interactionId.length === 0
    ) return { ok: false, reason: 'identity_mismatch' }

    const key = this.key(request.submissionId, request.toolCallId, request.interactionId)
    const pending = this.pending.get(key)
    if (!pending) {
      const matchingInteraction = Array.from(this.pending.values()).some(item => (
        item.descriptor.interactionId === request.interactionId
      ))
      if (matchingInteraction) return { ok: false, reason: 'identity_mismatch' }
      return this.resolvedIdentities.has(key)
        ? { ok: false, reason: 'already_resolved' }
        : { ok: false, reason: 'not_found' }
    }
    const descriptor = pending.descriptor
    if (descriptor.chatUuid !== request.chatUuid) {
      return { ok: false, reason: 'identity_mismatch' }
    }
    if (request.action === 'cancel') {
      this.resolvePending(key, {
        status: 'cancelled',
        interactionId: descriptor.interactionId,
        reason: typeof request.reason === 'string' && request.reason
          ? request.reason
          : 'user_cancelled'
      })
      return { ok: true }
    }

    if (request.action !== 'submit') {
      return { ok: false, reason: 'invalid_answers', message: 'Invalid action' }
    }

    if (!Array.isArray(request.answers)) {
      return { ok: false, reason: 'invalid_answers', message: 'answers must be an array' }
    }
    const answerError = validateAnswers(
      pending.questions,
      request.answers as ToolUserQuestionAnswer[]
    )
    if (answerError) {
      return { ok: false, reason: 'invalid_answers', message: answerError }
    }
    this.resolvePending(key, {
      status: 'submitted',
      interactionId: descriptor.interactionId,
      answers: request.answers as ToolUserQuestionAnswer[]
    })
    return { ok: true }
  }

  listPending(chatUuid: string): PendingToolQuestion[] {
    return Array.from(this.pending.values())
      .map(item => item.descriptor)
      .filter(item => item.chatUuid === chatUuid)
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  cancelForSubmission(submissionId: string, reason = 'run_cancelled'): void {
    for (const [key, pending] of this.pending.entries()) {
      if (pending.descriptor.submissionId === submissionId) {
        this.resolvePending(key, {
          status: 'cancelled',
          interactionId: pending.descriptor.interactionId,
          reason
        })
      }
    }
  }

  private resolvePending(key: string, result: ToolUserQuestionToolResult): void {
    const pending = this.pending.get(key)
    if (!pending) return
    clearTimeout(pending.timeoutId)
    this.pending.delete(key)
    this.rememberResolved(key)
    pending.emitter.emit(RUN_TOOL_EVENTS.TOOL_USER_QUESTION_RESOLVED, {
      toolCallId: pending.descriptor.toolCallId,
      interactionId: pending.descriptor.interactionId,
      status: result.status,
      reason: result.reason
    })
    pending.resolve(result)
  }

  private rememberResolved(key: string): void {
    this.resolvedIdentities.add(key)
    if (this.resolvedIdentities.size <= MAX_RESOLVED_IDENTITIES) return
    const oldest = this.resolvedIdentities.values().next().value
    if (oldest) this.resolvedIdentities.delete(oldest)
  }

  private key(submissionId: string, toolCallId: string, interactionId: string): string {
    return `${submissionId}\u0000${toolCallId}\u0000${interactionId}`
  }
}
