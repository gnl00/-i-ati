import type { CompactAgent } from '../compactAgent'
import type {
  ToolResultCompactionInput,
  ToolResultCompactionOutput,
  ToolResultCompactor
} from './contracts'
import {
  boundMetadataValue,
  boundStructuredModelInput,
  MODEL_INPUT_LIMITS
} from './modelInput'

const COMPACTOR_ID = 'web-document'
const COMPACTOR_VERSION = 2
const PROMPT_VERSION = 'web-fetch-v1'
const CONTENT_LIMITS = {
  balanced: 1_000,
  minimal: 500
} as const

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringifyRaw = (value: unknown): string => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const parseResult = (rawContent: unknown): JsonObject => {
  if (isObject(rawContent)) return rawContent
  if (typeof rawContent !== 'string') return { content: stringifyRaw(rawContent) }

  try {
    const parsed = JSON.parse(rawContent)
    return isObject(parsed) ? parsed : { content: rawContent }
  } catch {
    return { content: rawContent }
  }
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const compactText = (content: string, limit: number): { content: string; truncated: boolean } => {
  if (content.length <= limit) return { content, truncated: false }

  const marker = '\n\n[content compacted]\n\n'
  const available = limit - marker.length
  const headLength = Math.ceil(available * 0.75)
  const tailLength = Math.floor(available * 0.25)
  return {
    content: `${content.slice(0, headLength)}${marker}${content.slice(-tailLength)}`,
    truncated: true
  }
}

const copyDefined = (target: JsonObject, source: JsonObject, keys: string[]): void => {
  keys.forEach(key => {
    if (source[key] !== undefined) target[key] = source[key]
  })
}

export class WebFetchResultCompactor implements ToolResultCompactor {
  readonly id = COMPACTOR_ID
  readonly version = COMPACTOR_VERSION

  constructor(private readonly compactAgent?: Pick<CompactAgent, 'compact'>) {}

  async compact(input: ToolResultCompactionInput): Promise<ToolResultCompactionOutput> {
    const rawText = stringifyRaw(input.rawContent)
    const result = parseResult(input.rawContent)
    const args = isObject(input.args) ? input.args : {}
    const rawBody = stringValue(result.content) ?? ''
    const maxCharacters = CONTENT_LIMITS[input.level]
    let compactedBody: { content: string; truncated: boolean }
    let execution: ToolResultCompactionOutput['execution']
    let attemptedModelInput: ReturnType<typeof boundStructuredModelInput> | undefined

    try {
      if (rawBody.trim().length === 0) {
        throw new Error('EMPTY_SOURCE_CONTENT')
      }
      const compactAgent = this.compactAgent
        ?? new (await import('../compactAgent')).CompactAgent() as CompactAgent
      const modelInput = boundStructuredModelInput(
        {
          requestedUrl: boundMetadataValue(stringValue(args.url), 2_048),
          finalUrl: boundMetadataValue(stringValue(result.url), 2_048),
          title: boundMetadataValue(stringValue(result.title), 512),
          contentType: boundMetadataValue(stringValue(result.contentType), 128),
          toolStatus: input.status
        },
        rawBody,
        MODEL_INPUT_LIMITS[input.level],
        '\n\n[web source pre-compacted]\n\n'
      )
      attemptedModelInput = modelInput
      const modelResult = await compactAgent.compact({
        content: modelInput.content,
        contentType: 'web-fetch-result',
        profile: 'web-fetch-result',
        maxCharacters,
        maxInputCharacters: MODEL_INPUT_LIMITS[input.level],
        sensitiveDataPolicy: input.modelInputPolicy ?? 'redact-secrets',
        signal: input.signal,
        systemInstruction: [
          'Extract the information that is most useful for answering the user.',
          'Preserve concrete facts, names, numbers, dates, conclusions, errors, and source attribution.',
          'Ground every statement in the source content.',
          'Write dense plain text consisting solely of extracted content.'
        ].join(' '),
        userInstruction: 'Extract facts from the structured untrusted source.',
        promptVersion: PROMPT_VERSION
      })
      const modelContent = modelResult.content.trim()
      if (modelContent.length === 0) {
        throw new Error('EMPTY_MODEL_COMPACTION')
      }
      compactedBody = compactText(modelContent, maxCharacters)
      execution = {
        executionType: 'model',
        modelId: modelResult.modelId,
        promptVersion: modelResult.promptVersion,
        promptTokens: modelResult.usage?.promptTokens,
        completionTokens: modelResult.usage?.completionTokens,
        latencyMs: modelResult.latencyMs,
        inputCharacters: modelInput.originalCharacters,
        sentCharacters: modelResult.sentCharacters ?? modelInput.sentCharacters,
        inputTruncated: modelInput.truncated || modelResult.inputTruncated,
        redactionCount: modelResult.redactionCount
      }
    } catch {
      compactedBody = compactText(rawBody, maxCharacters)
      execution = {
        executionType: 'deterministic',
        promptVersion: PROMPT_VERSION,
        inputCharacters: attemptedModelInput?.originalCharacters,
        sentCharacters: attemptedModelInput?.sentCharacters,
        inputTruncated: attemptedModelInput?.truncated
      }
    }
    const compactResult: JsonObject = {
      status: input.status,
      success: result.success,
      requestedUrl: stringValue(args.url),
      url: stringValue(result.url),
      title: stringValue(result.title),
      content: compactedBody.content,
      truncation: {
        sourceTruncated: result.truncated === true,
        compactionTruncated:
          compactedBody.truncated || compactedBody.content !== rawBody,
        originalContentCharacters: rawBody.length
      }
    }

    copyDefined(compactResult, result, [
      'statusCode',
      'status',
      'contentType',
      'error',
      'source',
      'sources',
      'citation',
      'citations'
    ])

    const content = JSON.stringify(compactResult)
    return {
      content,
      compactorId: this.id,
      compactorVersion: this.version,
      originalCharacters: rawText.length,
      compactedCharacters: content.length,
      estimatedTokens: Math.ceil(content.length / 4),
      execution
    }
  }
}
