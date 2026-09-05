import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CliEventSink } from '@main/hosts/cli/CliEventSink'
import { runCliTask, type CliRunTaskInput } from '../CliRunOrchestrator'

const runRuntime = vi.hoisted(() => vi.fn())
vi.mock('../CliRuntimeRunner', () => ({ runCliRuntime: runRuntime }))

let directory: string
let input: CliRunTaskInput
const secret = 'test-orchestration-secret'

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ati-cli-orchestration-'))
  const modelConfig = {
    adapterPluginId: 'test', model: 'test', baseUrl: 'https://example.test',
    apiKey: secret, apiKeyEnv: 'TEST_API_KEY'
  }
  input = {
    runId: 'run-test', chatUuid: 'cli:run-test', signal: new AbortController().signal,
    prepared: {
      options: {
        maxSteps: 80, timeoutSeconds: 900, approval: 'deny', workspace: directory,
        instructionFile: 'task.md', config: 'config.json', outputDir: directory
      },
      instruction: 'task', workspace: directory,
      modelConfig,
      paths: {
        events: join(directory, 'events.jsonl'), result: join(directory, 'result.json'),
        transcript: join(directory, 'transcript.json'), sessionData: join(directory, '.session-data')
      }
    },
    profile: {
      secrets: [secret], requestSpec: { ...modelConfig, tools: [], systemPrompt: 'test' },
      initialTranscriptSeed: [], modelRef: { accountId: 'test', modelId: 'test' }
    }
  }
  runRuntime.mockReset().mockResolvedValue({
    status: 'failed', failure: { message: `provider failed: ${secret}` },
    transcript: { records: [] }, usage: { totalTokens: 12 }
  })
  vi.spyOn(CliEventSink.prototype, 'emit').mockResolvedValue()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it.each([new Error('runtime failed'), undefined])('persists a failed result when runtime throws %s', async (error) => {
  runRuntime.mockRejectedValue(error)

  expect(await runCliTask(input)).toBe(1)
  const result = JSON.parse(await readFile(input.prepared.paths.result, 'utf8'))
  expect(result.status).toBe('failed')
  expect(result.failure.message).toBe(error?.message ?? 'undefined')
  expect(vi.mocked(CliEventSink.prototype.emit).mock.calls.map(([type]) => type))
    .toEqual(['run.started', 'run.finished'])
})

it('skips runtime after a start-event failure and persists the failure', async () => {
  vi.mocked(CliEventSink.prototype.emit).mockRejectedValue(new Error('output unavailable'))

  expect(await runCliTask(input)).toBe(1)
  expect(runRuntime).not.toHaveBeenCalled()
  const result = JSON.parse(await readFile(input.prepared.paths.result, 'utf8'))
  expect(result).toMatchObject({ status: 'failed', failure: { message: 'output unavailable' } })
})

it.each(['transcript', 'terminal event'])('preserves runtime facts after a %s write failure', async (stage) => {
  if (stage === 'transcript') {
    input.prepared.paths.transcript = directory
  } else {
    vi.mocked(CliEventSink.prototype.emit).mockImplementation(async (type) => {
      if (type === 'run.finished') throw new Error(`stdout failed: ${secret}`)
    })
  }

  expect(await runCliTask(input)).toBe(1)
  const text = await readFile(input.prepared.paths.result, 'utf8')
  expect(text).not.toContain(secret)
  expect(JSON.parse(text)).toMatchObject({
    status: 'failed', failure: { message: 'provider failed: [REDACTED]' },
    usage: { totalTokens: 12 }, outputError: { message: expect.any(String) }
  })
  expect(vi.mocked(CliEventSink.prototype.emit).mock.calls.filter(([type]) => type === 'run.finished'))
    .toHaveLength(1)
})
