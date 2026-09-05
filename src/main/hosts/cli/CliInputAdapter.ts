import { getBuiltInRequestAdapterPlugin } from '@shared/plugins/requestAdapters'

export type CliApprovalMode = 'deny' | 'auto'

export const CLI_DEFAULT_TIMEOUT_SECONDS = 900
export const CLI_MAX_TIMEOUT_SECONDS = Math.floor(2_147_483_647 / 1_000)
export const CLI_DEFAULT_MAX_STEPS = 80

export interface CliRunOptions {
  instructionFile: string
  workspace: string
  config: string
  profileDir?: string
  outputDir: string
  timeoutSeconds: number
  maxSteps: number
  approval: CliApprovalMode
}

export interface CliModelConfig {
  adapterPluginId: string
  baseUrl: string
  model: string
  apiKeyEnv: string
  apiKey: string
  systemPrompt?: string
  options?: {
    thinking?: UnifiedRequestThinkingOption
  }
  requestOverrides?: Record<string, unknown>
}

export type CliInput =
  | { kind: 'help' }
  | { kind: 'run'; options: CliRunOptions }

export class CliInputError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'CliInputError'
  }
}

const OPTION_NAMES = new Set([
  '--instruction-file',
  '--workspace',
  '--config',
  '--output-dir',
  '--timeout-seconds',
  '--max-steps',
  '--approval',
  '--profile-dir'
])

const PROTECTED_API_KEY_ENV_NAMES = new Set([
  'ELECTRON_RUN_AS_NODE',
  'HOME',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
  'PWD',
  'PYTHONPATH',
  'SHELL',
  'TMPDIR'
])

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const assertKnownFields = (
  value: Record<string, unknown>,
  path: string,
  fields: readonly string[]
): void => {
  const knownFields = new Set(fields)
  for (const field of Object.keys(value)) {
    if (!knownFields.has(field)) {
      throw new CliInputError('CONFIG_FIELD_INVALID', `Config field "${path}.${field}" is not allowed`)
    }
  }
}

const parseModelOptions = (value: unknown): CliModelConfig['options'] => {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "options" must be a JSON object')
  }
  assertKnownFields(value, 'options', ['thinking'])

  if (value.thinking === undefined) {
    return {}
  }
  if (!isRecord(value.thinking)) {
    throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "options.thinking" must be a JSON object')
  }
  assertKnownFields(value.thinking, 'options.thinking', ['enabled', 'effort'])
  if (typeof value.thinking.enabled !== 'boolean') {
    throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "options.thinking.enabled" must be a boolean')
  }

  const effort = value.thinking.effort
  if (effort !== undefined && (typeof effort !== 'string' || effort.trim().length === 0)) {
    throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "options.thinking.effort" must be a non-empty string')
  }

  return {
    thinking: {
      enabled: value.thinking.enabled,
      ...(effort !== undefined ? { effort: effort.trim() } : {})
    }
  }
}

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CliInputError('CONFIG_FIELD_INVALID', `Config field "${field}" must be a non-empty string`)
  }
  return value.trim()
}

export const parsePositiveInteger = (value: string, field: string): number => {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new CliInputError('ARGUMENT_VALUE_INVALID', `Option "${field}" must be a positive finite integer`)
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliInputError('ARGUMENT_VALUE_INVALID', `Option "${field}" must be a positive finite integer`)
  }
  return parsed
}

const readOptionValue = (
  token: string,
  argv: string[],
  index: number
): { name: string; value: string; nextIndex: number } => {
  const equalsIndex = token.indexOf('=')
  const name = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token
  if (!OPTION_NAMES.has(name)) {
    throw new CliInputError('ARGUMENT_UNKNOWN', `Unknown option "${name}"`)
  }

  const inlineValue = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined
  const value = inlineValue ?? argv[index + 1]
  if (value === undefined || value.length === 0 || (inlineValue === undefined && value.startsWith('--'))) {
    throw new CliInputError('ARGUMENT_VALUE_MISSING', `Option "${name}" requires a value`)
  }

  return {
    name,
    value,
    nextIndex: inlineValue === undefined ? index + 1 : index
  }
}

export const parseCliArguments = (argv: string[]): CliInput => {
  if (argv.length === 0 || argv[0] === '--help' || argv.includes('--help')) {
    return { kind: 'help' }
  }

  if (argv[0] !== 'run') {
    throw new CliInputError('ARGUMENT_COMMAND_INVALID', 'Expected the "run" command')
  }

  const values = new Map<string, string>()
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      throw new CliInputError('ARGUMENT_UNKNOWN', `Unexpected argument "${token}"`)
    }

    const parsed = readOptionValue(token, argv, index)
    if (values.has(parsed.name)) {
      throw new CliInputError('ARGUMENT_DUPLICATE', `Option "${parsed.name}" was provided more than once`)
    }
    values.set(parsed.name, parsed.value)
    index = parsed.nextIndex
  }

  const requiredOptions = [
    '--instruction-file',
    '--workspace',
    '--config',
    '--output-dir'
  ] as const
  for (const option of requiredOptions) {
    if (!values.has(option)) {
      throw new CliInputError('ARGUMENT_REQUIRED', `Missing required option "${option}"`)
    }
  }

  const timeoutSeconds = values.has('--timeout-seconds')
    ? parsePositiveInteger(values.get('--timeout-seconds')!, '--timeout-seconds')
    : CLI_DEFAULT_TIMEOUT_SECONDS
  if (timeoutSeconds > CLI_MAX_TIMEOUT_SECONDS) {
    throw new CliInputError(
      'ARGUMENT_VALUE_INVALID',
      `Option "--timeout-seconds" must be at most ${CLI_MAX_TIMEOUT_SECONDS}`
    )
  }
  const maxSteps = values.has('--max-steps')
    ? parsePositiveInteger(values.get('--max-steps')!, '--max-steps')
    : CLI_DEFAULT_MAX_STEPS
  const approval = values.get('--approval') ?? 'deny'
  if (approval !== 'deny' && approval !== 'auto') {
    throw new CliInputError('ARGUMENT_VALUE_INVALID', 'Option "--approval" must be "deny" or "auto"')
  }

  return {
    kind: 'run',
    options: {
      instructionFile: values.get('--instruction-file')!,
      workspace: values.get('--workspace')!,
      config: values.get('--config')!,
      profileDir: values.get('--profile-dir'),
      outputDir: values.get('--output-dir')!,
      timeoutSeconds,
      maxSteps,
      approval
    }
  }
}

const supportsAgentModel = (adapterPluginId: string): boolean => {
  const definition = getBuiltInRequestAdapterPlugin(adapterPluginId)
  if (!definition) return false

  return definition.capabilities.some((capability) => (
    capability.kind === 'request-adapter'
    && capability.modelTypes.some((modelType) => modelType === 'llm' || modelType === 'vlm')
  ))
}

export const parseCliModelConfig = (
  rawConfig: string,
  environment: NodeJS.ProcessEnv = process.env
): CliModelConfig => {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawConfig)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON'
    throw new CliInputError('CONFIG_JSON_INVALID', `Model config JSON is invalid: ${detail}`)
  }

  if (!isRecord(parsed)) {
    throw new CliInputError('CONFIG_JSON_INVALID', 'Model config must be a JSON object')
  }

  const adapterPluginId = requiredString(parsed.adapterPluginId, 'adapterPluginId')
  if (!supportsAgentModel(adapterPluginId)) {
    throw new CliInputError(
      'CONFIG_ADAPTER_INVALID',
      `Config adapterPluginId "${adapterPluginId}" is not a supported built-in agent adapter`
    )
  }

  const baseUrl = requiredString(parsed.baseUrl, 'baseUrl').replace(/\/+$/, '')
  let parsedBaseUrl: URL
  try {
    parsedBaseUrl = new URL(baseUrl)
  } catch {
    throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "baseUrl" must be an absolute HTTP(S) URL')
  }
  if ((parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') || parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "baseUrl" must be an absolute HTTP(S) URL without embedded credentials')
  }

  const model = requiredString(parsed.model, 'model')
  const apiKeyEnv = requiredString(parsed.apiKeyEnv, 'apiKeyEnv')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "apiKeyEnv" must be a valid environment variable name')
  }
  if (PROTECTED_API_KEY_ENV_NAMES.has(apiKeyEnv)) {
    throw new CliInputError('CONFIG_FIELD_INVALID', `Config field "apiKeyEnv" cannot use protected environment variable "${apiKeyEnv}"`)
  }
  const apiKey = environment[apiKeyEnv]
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new CliInputError('CONFIG_API_KEY_MISSING', `Environment variable "${apiKeyEnv}" is missing or empty`)
  }

  let systemPrompt: string | undefined
  if (parsed.systemPrompt !== undefined) {
    if (typeof parsed.systemPrompt !== 'string' || parsed.systemPrompt.trim().length === 0) {
      throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "systemPrompt" must be a non-empty string when provided')
    }
    systemPrompt = parsed.systemPrompt
  }

  const options = parseModelOptions(parsed.options)

  let requestOverrides: Record<string, unknown> | undefined
  if (parsed.requestOverrides !== undefined) {
    if (!isRecord(parsed.requestOverrides)) {
      throw new CliInputError('CONFIG_FIELD_INVALID', 'Config field "requestOverrides" must be a JSON object')
    }
    requestOverrides = { ...parsed.requestOverrides }
  }

  return {
    adapterPluginId,
    baseUrl,
    model,
    apiKeyEnv,
    apiKey,
    systemPrompt,
    options,
    requestOverrides
  }
}

export const CLI_HELP_TEXT = `Usage:
  pnpm cli --help
  pnpm cli run --instruction-file <path> --workspace <dir> --config <file> --output-dir <dir> [options]

Required options:
  --instruction-file <path>  UTF-8 task instruction file
  --workspace <dir>          Existing task workspace directory
  --config <file>            JSON model configuration
  --output-dir <dir>         New or empty run output directory

Optional options:
  --profile-dir <dir>        App profile (defaults to the desktop app profile)
  --timeout-seconds <n>      Whole-run timeout (default: ${CLI_DEFAULT_TIMEOUT_SECONDS})
  --max-steps <n>            Hard step limit (default: ${CLI_DEFAULT_MAX_STEPS})
  --approval <deny|auto>     Tool approval mode (default: deny)
`
