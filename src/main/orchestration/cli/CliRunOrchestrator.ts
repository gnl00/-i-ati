import type { CliChatProfile } from './CliChatProfile'
import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  realpath,
  unlink,
  writeFile
} from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { AgentLoopResult } from '@main/agent/runtime/loop/AgentLoopResult'
import type { AgentTranscriptSnapshot } from '@main/agent/runtime/transcript/AgentTranscript'
import type { AgentTranscriptRecord } from '@main/agent/runtime/transcript/AgentTranscriptRecord'
import {
  parseCliModelConfig,
  type CliInput,
  type CliModelConfig,
  type CliRunOptions
} from '@main/hosts/cli/CliInputAdapter'
import { CliEventSink } from '@main/hosts/cli/CliEventSink'
import { CliInputError } from '@main/hosts/cli/CliInputAdapter'
import { redactCliValue } from '@main/hosts/cli/CliRedaction'

export type CliAbortKind = 'timeout' | 'SIGINT' | 'SIGTERM'

export interface CliPreparedRun {
  options: CliRunOptions
  instruction: string
  workspace: string
  modelConfig: CliModelConfig
  paths: {
    events: string
    result: string
    transcript: string
    sessionData: string
  }
}

export interface CliRunTaskInput {
  prepared: CliPreparedRun
  runId: string
  chatUuid: string
  profile: CliChatProfile
  signal: AbortSignal
  startedAt?: number
  getAbortKind?: () => CliAbortKind | undefined
}

const ARTIFACT_NAMES = {
  events: 'events.jsonl',
  result: 'result.json',
  transcript: 'transcript.json'
} as const

const OUTPUT_LOCK_NAME = '.run.lock'

const EMPTY_TRANSCRIPT = (runId: string, timestamp: number): AgentTranscriptSnapshot => ({
  transcriptId: `cli:${runId}`,
  createdAt: timestamp,
  updatedAt: timestamp,
  records: []
})

const toErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
)

const toErrorInfo = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof (error as Error & { code?: unknown }).code === 'string'
        ? { code: (error as Error & { code: string }).code }
        : {})
    }
  }
  return { message: String(error) }
}

const readDirectoryOrThrow = async (path: string): Promise<string[]> => {
  try {
    const entries = await readdir(path)
    return entries
  } catch (error) {
    throw new CliInputError('PATH_READ_FAILED', `Unable to read directory "${path}": ${toErrorMessage(error)}`)
  }
}

const resolveExistingDirectory = async (rawPath: string, field: string): Promise<string> => {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new CliInputError('PATH_INVALID', `Option "${field}" must be a non-empty path`)
  }

  const requested = resolve(rawPath)
  let stats: Awaited<ReturnType<typeof lstat>>
  try {
    stats = await lstat(requested)
  } catch (error) {
    throw new CliInputError('PATH_MISSING', `Option "${field}" must point to an existing directory: ${toErrorMessage(error)}`)
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new CliInputError('PATH_INVALID', `Option "${field}" must point to a directory`)
  }

  try {
    return await realpath(requested)
  } catch (error) {
    throw new CliInputError('PATH_READ_FAILED', `Unable to normalize option "${field}": ${toErrorMessage(error)}`)
  }
}

const resolveInputFile = async (rawPath: string, field: string): Promise<string> => {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new CliInputError('PATH_INVALID', `Option "${field}" must be a non-empty path`)
  }

  const requested = resolve(rawPath)
  let stats: Awaited<ReturnType<typeof lstat>>
  try {
    stats = await lstat(requested)
  } catch (error) {
    throw new CliInputError('PATH_MISSING', `Option "${field}" must point to an existing file: ${toErrorMessage(error)}`)
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new CliInputError('PATH_INVALID', `Option "${field}" must point to a regular file`)
  }
  return requested
}

const ensureOutputDirectory = async (rawPath: string): Promise<string> => {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new CliInputError('PATH_INVALID', 'Option "--output-dir" must be a non-empty path')
  }

  const requested = resolve(rawPath)
  try {
    const stats = await lstat(requested)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new CliInputError('OUTPUT_INVALID', 'Option "--output-dir" must point to a directory')
    }
    const entries = await readDirectoryOrThrow(requested)
    if (entries.length > 0) {
      throw new CliInputError('OUTPUT_EXISTS', 'Option "--output-dir" must be new or empty')
    }
  } catch (error) {
    if (error instanceof CliInputError) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw new CliInputError('OUTPUT_READ_FAILED', `Unable to inspect option "--output-dir": ${toErrorMessage(error)}`)
    }
    try {
      await mkdir(requested, { recursive: true })
    } catch (mkdirError) {
      throw new CliInputError('OUTPUT_CREATE_FAILED', `Unable to create option "--output-dir": ${toErrorMessage(mkdirError)}`)
    }
    const createdStats = await lstat(requested)
    if (createdStats.isSymbolicLink() || !createdStats.isDirectory()) {
      throw new CliInputError('OUTPUT_INVALID', 'Option "--output-dir" must point to a directory')
    }
  }

  return requested
}

const claimOutputDirectory = async (outputDir: string): Promise<void> => {
  try {
    await writeFile(resolve(outputDir, OUTPUT_LOCK_NAME), `${randomUUID()}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      throw new CliInputError('OUTPUT_EXISTS', 'Option "--output-dir" is already claimed by another run')
    }
    throw new CliInputError('OUTPUT_CREATE_FAILED', `Unable to claim option "--output-dir": ${toErrorMessage(error)}`)
  }
}

const assertInputIsReadable = async (path: string, field: string): Promise<void> => {
  try {
    await access(path, fsConstants.R_OK)
  } catch (error) {
    throw new CliInputError('PATH_UNREADABLE', `Option "${field}" is not readable: ${toErrorMessage(error)}`)
  }
}

export const prepareCliRun = async (
  input: Extract<CliInput, { kind: 'run' }>
): Promise<CliPreparedRun> => {
  const options = input.options
  const instructionPath = await resolveInputFile(options.instructionFile, '--instruction-file')
  const configPath = await resolveInputFile(options.config, '--config')
  await assertInputIsReadable(instructionPath, '--instruction-file')
  await assertInputIsReadable(configPath, '--config')

  let instruction: string
  let rawConfig: string
  try {
    ;[instruction, rawConfig] = await Promise.all([
      readFile(instructionPath, 'utf8'),
      readFile(configPath, 'utf8')
    ])
  } catch (error) {
    throw new CliInputError('INPUT_READ_FAILED', `Unable to read CLI input: ${toErrorMessage(error)}`)
  }
  if (instruction.trim().length === 0) {
    throw new CliInputError('INSTRUCTION_EMPTY', 'Instruction file must contain a non-empty UTF-8 task')
  }

  // Configuration is validated before the output directory is claimed so a
  // malformed invocation leaves the caller's output location untouched.
  const modelConfig = parseCliModelConfig(rawConfig)
  const workspace = await resolveExistingDirectory(options.workspace, '--workspace')
  const outputDir = await ensureOutputDirectory(options.outputDir)
  const workspaceRelation = relative(workspace, outputDir)
  if (workspaceRelation === '') {
    throw new CliInputError('OUTPUT_INVALID', 'Option "--output-dir" must be separate from the workspace')
  }
  await claimOutputDirectory(outputDir)

  return {
    options,
    instruction,
    workspace,
    modelConfig,
    paths: {
      events: resolve(outputDir, ARTIFACT_NAMES.events),
      result: resolve(outputDir, ARTIFACT_NAMES.result),
      transcript: resolve(outputDir, ARTIFACT_NAMES.transcript),
      sessionData: resolve(outputDir, '.session-data')
    }
  }
}

const fingerprint = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex')

const getFinalText = (runtimeResult: AgentLoopResult | undefined): string => {
  if (runtimeResult?.status === 'completed') {
    return runtimeResult.finalStep.content
  }

  const records = runtimeResult?.transcript.records ?? []
  const assistantRecord = [...records]
    .reverse()
    .find((record): record is Extract<AgentTranscriptRecord, { kind: 'assistant_step' }> => record.kind === 'assistant_step')
  return assistantRecord?.step.content ?? ''
}

const atomicWriteJson = async (path: string, value: unknown): Promise<void> => {
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, path)
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

const toAbortReason = (kind: CliAbortKind): string => {
  if (kind === 'timeout') return 'CLI run timed out'
  return `CLI run received ${kind}`
}

const toAbortExitCode = (kind: CliAbortKind): number => {
  if (kind === 'timeout') return 124
  return kind === 'SIGINT' ? 130 : 143
}

export const runCliTask = async (input: CliRunTaskInput): Promise<number> => {
  const startedAt = input.startedAt ?? Date.now()
  const { prepared } = input
  const secrets = input.profile.secrets
  const toolNames = (input.profile.requestSpec.tools as { name: string }[]).map(tool => tool.name)
  const eventSink = new CliEventSink({
    runId: input.runId,
    eventsPath: prepared.paths.events,
    secrets
  })
  await writeFile(prepared.paths.events, '', 'utf8')

  const systemPrompt = input.profile.requestSpec.systemPrompt ?? ''
  const thinking = input.profile.requestSpec.options?.thinking
  const profile = {
    id: 'cli-chat-profile-v2',
    systemPrompt: redactCliValue(systemPrompt, secrets),
    systemPromptSha256: fingerprint(systemPrompt),
    toolNames,
    toolsetSha256: fingerprint(input.profile.requestSpec.tools),
    modelConfigSha256: fingerprint({
      adapterPluginId: prepared.modelConfig.adapterPluginId,
      baseUrl: prepared.modelConfig.baseUrl,
      model: prepared.modelConfig.model,
      systemPrompt,
      options: input.profile.requestSpec.options ?? {},
      requestOverrides: input.profile.requestSpec.requestOverrides ?? {},
      payloadExtensions: input.profile.requestSpec.payloadExtensions ?? {}
    }),
    toolsetFingerprintScope: 'tool definitions including schemas and sources',
    desktopProfileDifferences: [
      'single task input from an instruction file',
      'CLI JSONL output with file artifacts',
      'fresh task history; shared app configuration and Chat request preparation',
      'terminal output; desktop interaction requires a host UI'
    ]
  }
  const budget = {
    maxSteps: prepared.options.maxSteps
  }
  const artifacts = { ...ARTIFACT_NAMES }

  let runtimeResult: AgentLoopResult | undefined
  let thrownError: unknown
  try {
    await eventSink.emit('run.started', {
      hostType: 'cli',
      profileId: profile.id,
      model: {
        adapterPluginId: prepared.modelConfig.adapterPluginId,
        baseUrl: prepared.modelConfig.baseUrl,
        model: prepared.modelConfig.model,
        apiKeyEnv: prepared.modelConfig.apiKeyEnv,
        ...(thinking ? { thinking } : {})
      },
      workspace: prepared.workspace,
      toolNames,
      budget,
      approval: prepared.options.approval,
      profile: {
        systemPromptSha256: profile.systemPromptSha256,
        toolsetSha256: profile.toolsetSha256,
        modelConfigSha256: profile.modelConfigSha256
      }
    }, startedAt)
    const { runCliRuntime } = await import('./CliRuntimeRunner')
    runtimeResult = await runCliRuntime({
      runId: input.runId,
      instruction: prepared.instruction,
      workspace: prepared.workspace,
      chatUuid: input.chatUuid,
      approval: prepared.options.approval,
      maxSteps: prepared.options.maxSteps,
      profile: input.profile,
      eventSink,
      signal: input.signal
    })
  } catch (error) {
    thrownError = error
  }

  const abortKind = input.getAbortKind?.()
  const finishedAt = Date.now()
  const transcript = runtimeResult?.transcript ?? EMPTY_TRANSCRIPT(input.runId, startedAt)
  const status = abortKind ? 'aborted' : runtimeResult?.status ?? 'failed'
  const failure = status === 'failed'
    ? (runtimeResult?.status === 'failed' ? runtimeResult.failure : toErrorInfo(thrownError))
    : undefined
  const abortReason = status === 'aborted'
    ? (abortKind
      ? toAbortReason(abortKind)
      : runtimeResult?.status === 'aborted'
        ? runtimeResult.abortReason
        : toErrorMessage(thrownError ?? 'CLI run aborted'))
    : undefined
  const finalText = getFinalText(runtimeResult)
  const usage = runtimeResult?.usage
  const resultDocument = redactCliValue({
    schemaVersion: 1,
    runId: input.runId,
    status,
    startedAt,
    completedAt: finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    agentStartedAt: runtimeResult?.startedAt,
    agentCompletedAt: runtimeResult?.completedAt,
    model: {
      adapterPluginId: prepared.modelConfig.adapterPluginId,
      baseUrl: prepared.modelConfig.baseUrl,
      model: prepared.modelConfig.model,
      apiKeyEnv: prepared.modelConfig.apiKeyEnv
    },
    workspace: prepared.workspace,
    tools: toolNames,
    timeoutSeconds: prepared.options.timeoutSeconds,
    budget,
    approval: prepared.options.approval,
    ...(thinking ? { thinking } : {}),
    requestOverrides: prepared.modelConfig.requestOverrides,
    profile,
    finalText,
    usage,
    ...(failure ? { failure } : {}),
    ...(abortReason ? { abortReason } : {}),
    artifacts
  }, secrets) as Record<string, unknown>

  let outputError: unknown
  try {
    await atomicWriteJson(prepared.paths.transcript, redactCliValue({
      schemaVersion: 1,
      runId: input.runId,
      ...transcript
    }, secrets))
    await atomicWriteJson(prepared.paths.result, resultDocument)
  } catch (error) {
    outputError = error
  }

  const finalStatus = outputError ? 'failed' : status
  const exitCode = outputError
    ? 1
    : abortKind
      ? toAbortExitCode(abortKind)
      : status === 'completed' ? 0 : 1
  const finishedPayload = {
    status: finalStatus,
    exitCode,
    finalText,
    usage,
    ...(failure ? { failure } : {}),
    ...(abortReason ? { abortReason } : {}),
    ...(outputError ? { outputError: toErrorInfo(outputError) } : {}),
    artifacts
  }

  try {
    await eventSink.emit('run.finished', finishedPayload, finishedAt)
  } catch (error) {
    outputError = outputError ?? error
  }

  if (outputError) {
    await atomicWriteJson(prepared.paths.result, {
      ...resultDocument,
      status: 'failed',
      outputError: redactCliValue(toErrorInfo(outputError), secrets)
    }).catch(() => undefined)
  }

  return outputError ? 1 : exitCode
}
