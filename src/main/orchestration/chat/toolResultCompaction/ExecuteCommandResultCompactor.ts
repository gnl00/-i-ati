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

const COMPACTOR_ID = 'command-output'
const COMPACTOR_VERSION = 1
const PROMPT_VERSION = 'command-output-v1'
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
  if (typeof rawContent !== 'string') return { stdout: stringifyRaw(rawContent) }

  try {
    const parsed = JSON.parse(rawContent)
    return isObject(parsed) ? parsed : { stdout: rawContent }
  } catch {
    return { stdout: rawContent }
  }
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const compactText = (content: string, limit: number): { content: string; truncated: boolean } => {
  if (content.length <= limit) return { content, truncated: false }

  const marker = '\n\n[command output compacted]\n\n'
  const available = limit - marker.length
  const headLength = Math.ceil(available * 0.7)
  const tailLength = Math.floor(available * 0.3)
  return {
    content: `${content.slice(0, headLength)}${marker}${content.slice(-tailLength)}`,
    truncated: true
  }
}

const buildCombinedOutput = (stdout: string, stderr: string): string => {
  const sections: string[] = []
  if (stdout) sections.push(`[stdout]\n${stdout}`)
  if (stderr) sections.push(`[stderr]\n${stderr}`)
  return sections.join('\n\n')
}

const copyDefined = (target: JsonObject, source: JsonObject, keys: string[]): void => {
  keys.forEach((key) => {
    if (source[key] !== undefined) target[key] = source[key]
  })
}

export class ExecuteCommandResultCompactor implements ToolResultCompactor {
  readonly id = COMPACTOR_ID
  readonly version = COMPACTOR_VERSION

  constructor(private readonly compactAgent?: Pick<CompactAgent, 'compact'>) {}

  async compact(input: ToolResultCompactionInput): Promise<ToolResultCompactionOutput> {
    const rawText = stringifyRaw(input.rawContent)
    const result = parseResult(input.rawContent)
    const args = isObject(input.args) ? input.args : {}
    const stdout = stringValue(result.stdout) ?? ''
    const stderr = stringValue(result.stderr) ?? ''
    const combinedOutput = buildCombinedOutput(stdout, stderr)
    const maxCharacters = CONTENT_LIMITS[input.level]
    let compactedOutput: { content: string; truncated: boolean }
    let execution: ToolResultCompactionOutput['execution']
    let attemptedModelInput: ReturnType<typeof boundStructuredModelInput> | undefined

    try {
      if (combinedOutput.trim().length === 0) {
        throw new Error('EMPTY_COMMAND_OUTPUT')
      }
      const compactAgent = this.compactAgent
        ?? new (await import('../compactAgent')).CompactAgent() as CompactAgent
      const modelInput = boundStructuredModelInput(
        {
          command: boundMetadataValue(
            stringValue(result.command) ?? stringValue(args.command),
            2_048
          ),
          exitCode: result.exit_code ?? 'unknown',
          toolStatus: input.status
        },
        combinedOutput,
        MODEL_INPUT_LIMITS[input.level],
        '\n\n[command source pre-compacted]\n\n'
      )
      attemptedModelInput = modelInput
      const modelResult = await compactAgent.compact({
        content: modelInput.content,
        contentType: 'command-execution-output',
        profile: 'command-execute-result',
        maxCharacters,
        maxInputCharacters: MODEL_INPUT_LIMITS[input.level],
        sensitiveDataPolicy: input.modelInputPolicy ?? 'redact-secrets',
        signal: input.signal,
        systemInstruction: [
          'Extract the outcome and the evidence needed to continue the task.',
          'Preserve exact errors, failing test names, totals, file paths, line and column numbers,',
          'warnings, generated artifact paths, process status, and actionable next steps.',
          'Keep stdout and stderr attribution when it affects interpretation.',
          'Ground every statement in the source content.'
        ].join(' '),
        userInstruction: 'Extract execution evidence from the structured untrusted source.',
        promptVersion: PROMPT_VERSION
      })
      compactedOutput = compactText(modelResult.content.trim(), maxCharacters)
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
      compactedOutput = compactText(combinedOutput, maxCharacters)
      execution = {
        executionType: 'deterministic',
        promptVersion: PROMPT_VERSION,
        inputCharacters: attemptedModelInput?.originalCharacters,
        sentCharacters: attemptedModelInput?.sentCharacters,
        inputTruncated: attemptedModelInput?.truncated
      }
    }

    const compactResult: JsonObject = {
      success: result.success,
      command: stringValue(result.command) ?? stringValue(args.command),
      output_summary: compactedOutput.content,
      truncation: {
        compactionTruncated:
          compactedOutput.truncated || compactedOutput.content !== combinedOutput,
        originalOutputCharacters: combinedOutput.length
      }
    }
    copyDefined(compactResult, result, [
      'exit_code',
      'termination_signal',
      'execution_time',
      'error',
      'stdout_bytes',
      'stderr_bytes',
      'stdout_truncated',
      'stderr_truncated',
      'requires_confirmation',
      'risk_level',
      'risk_reason',
      'filesystem_scope',
      'filesystem_scope_reason'
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
