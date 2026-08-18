import { v4 as uuidv4 } from 'uuid'
import type { EmbeddedToolExecutionContext } from '@shared/tools/registry'
import type {
  ToolUserQuestion,
  ToolUserQuestionAnswer,
  ToolUserQuestionOption,
  ToolUserQuestionToolResult,
  ToolUserQuestionType
} from '@shared/tools/userQuestion'

const DEFAULT_TIMEOUT_SECONDS = 60
const MIN_TIMEOUT_SECONDS = 60
const LEGACY_MIN_TIMEOUT_SECONDS = 5
const MAX_TIMEOUT_SECONDS = 300
const DEFAULT_TEXT_MAX_LENGTH = 2000

type ModelQuestion = {
  id?: unknown
  header?: unknown
  prompt?: unknown
  type?: unknown
  required?: unknown
  options?: unknown
  min_selections?: unknown
  max_selections?: unknown
  placeholder?: unknown
  max_length?: unknown
  recommended_text?: unknown
}

type AskUserQuestionArgs = {
  questions?: unknown
  timeout_seconds?: unknown
}

type ValidationResult =
  | {
      valid: true
      questions: ToolUserQuestion[]
      recommendedAnswers: ToolUserQuestionAnswer[]
      timeoutMs: number
    }
  | { valid: false; message: string }

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`)
  }
  return normalized
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  if (value.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`)
  return value
}

function integerInRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} must be an integer between ${minimum} and ${maximum}`)
  }
  return value as number
}

function normalizeOptions(value: unknown, questionId: string): ToolUserQuestionOption[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    throw new Error(`questions.${questionId}.options must contain 1 to 12 options`)
  }
  const seen = new Set<string>()
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`questions.${questionId}.options.${index} must be an object`)
    }
    const option = raw as Record<string, unknown>
    const id = requiredString(option.id, `questions.${questionId}.options.${index}.id`, 64)
    if (seen.has(id)) throw new Error(`Duplicate option id "${id}" in question "${questionId}"`)
    seen.add(id)
    return {
      id,
      label: requiredString(option.label, `questions.${questionId}.options.${index}.label`, 160),
      description: optionalString(
        option.description,
        `questions.${questionId}.options.${index}.description`,
        500
      ),
      recommended: option.recommended === true
    }
  })
}

function normalizeQuestion(raw: ModelQuestion, index: number): {
  question: ToolUserQuestion
  recommendedAnswer?: ToolUserQuestionAnswer
} {
  const id = requiredString(raw.id, `questions.${index}.id`, 64)
  const type = raw.type as ToolUserQuestionType
  if (!['single_select', 'multi_select', 'text'].includes(type)) {
    throw new Error(`questions.${id}.type is invalid`)
  }
  if (typeof raw.required !== 'boolean') {
    throw new Error(`questions.${id}.required must be a boolean`)
  }

  const base = {
    id,
    header: optionalString(raw.header, `questions.${id}.header`, 80),
    prompt: requiredString(raw.prompt, `questions.${id}.prompt`, 1000),
    type,
    required: raw.required,
    placeholder: optionalString(raw.placeholder, `questions.${id}.placeholder`, 200)
  }

  if (type === 'text') {
    const maxLength = integerInRange(
      raw.max_length,
      `questions.${id}.max_length`,
      1,
      4000,
      DEFAULT_TEXT_MAX_LENGTH
    )
    const recommendedText = optionalString(
      raw.recommended_text,
      `questions.${id}.recommended_text`,
      maxLength
    )
    if (raw.required && (!recommendedText || recommendedText.trim().length === 0)) {
      throw new Error(`Required text question "${id}" needs recommended_text for timeout continuation`)
    }
    return {
      question: { ...base, maxLength, recommendedText },
      recommendedAnswer: recommendedText !== undefined
        ? { questionId: id, text: recommendedText }
        : undefined
    }
  }

  const options = normalizeOptions(raw.options, id)
  const recommendedIds = options.filter(option => option.recommended).map(option => option.id)
  const defaultMin = raw.required ? 1 : 0
  const minSelections = integerInRange(
    raw.min_selections,
    `questions.${id}.min_selections`,
    raw.required ? 1 : 0,
    options.length,
    defaultMin
  )
  const defaultMax = type === 'single_select' ? 1 : options.length
  const maxSelections = integerInRange(
    raw.max_selections,
    `questions.${id}.max_selections`,
    1,
    options.length,
    defaultMax
  )
  if (type === 'single_select' && (minSelections > 1 || maxSelections !== 1)) {
    throw new Error(`Single-select question "${id}" must allow at most one option`)
  }
  if (minSelections > maxSelections) {
    throw new Error(`questions.${id}.min_selections exceeds max_selections`)
  }
  if (recommendedIds.length < minSelections || recommendedIds.length > maxSelections) {
    throw new Error(`Question "${id}" needs ${minSelections}-${maxSelections} recommended options`)
  }

  return {
    question: { ...base, options, minSelections, maxSelections },
    recommendedAnswer: recommendedIds.length > 0
      ? { questionId: id, optionIds: recommendedIds }
      : undefined
  }
}

export function validateAskUserQuestionArgs(args: AskUserQuestionArgs = {}): ValidationResult {
  try {
    if (!Array.isArray(args.questions) || args.questions.length < 1 || args.questions.length > 3) {
      return { valid: false, message: 'questions must contain 1 to 3 items' }
    }
    const normalized = args.questions.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`questions.${index} must be an object`)
      }
      return normalizeQuestion(raw as ModelQuestion, index)
    })
    const questionIds = normalized.map(item => item.question.id)
    if (new Set(questionIds).size !== questionIds.length) {
      return { valid: false, message: 'Question ids must be unique' }
    }
    const timeoutSeconds = Math.max(
      MIN_TIMEOUT_SECONDS,
      integerInRange(
        args.timeout_seconds,
        'timeout_seconds',
        LEGACY_MIN_TIMEOUT_SECONDS,
        MAX_TIMEOUT_SECONDS,
        DEFAULT_TIMEOUT_SECONDS
      )
    )
    return {
      valid: true,
      questions: normalized.map(item => item.question),
      recommendedAnswers: normalized.flatMap(item => item.recommendedAnswer ? [item.recommendedAnswer] : []),
      timeoutMs: timeoutSeconds * 1000
    }
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function processAskUserQuestion(
  args: AskUserQuestionArgs = {},
  context: EmbeddedToolExecutionContext = {}
): Promise<ToolUserQuestionToolResult> {
  const validated = validateAskUserQuestionArgs(args)
  if (!validated.valid) {
    return { status: 'unavailable', reason: validated.message }
  }
  if (
    !context.requestUserQuestion
    || !context.toolCallId
    || !context.chatUuid
    || !context.submissionId
  ) {
    return {
      status: 'unavailable',
      reason: 'User questions are available in an active desktop chat run.'
    }
  }

  return await context.requestUserQuestion({
    toolCallId: context.toolCallId,
    interactionId: uuidv4(),
    chatUuid: context.chatUuid,
    questions: validated.questions,
    timeoutMs: validated.timeoutMs,
    recommendedAnswers: validated.recommendedAnswers
  })
}
