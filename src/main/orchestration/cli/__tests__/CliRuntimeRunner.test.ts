import { beforeEach, expect, it, vi } from 'vitest'
import type { RunSubmissionOptions, RunOutcome } from '@main/orchestration/chat/run'
import { runCliRuntime, type CliRuntimeRunInput } from '../CliRuntimeRunner'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  cancel: vi.fn(),
  wait: vi.fn()
}))
vi.mock('@main/orchestration/chat/run', () => ({
  RunService: class {
    submit = mocks.submit
    cancel = mocks.cancel
    waitForPostRunJobs = mocks.wait
  }
}))

let input: CliRuntimeRunInput
let outcome: RunOutcome
beforeEach(() => {
  vi.clearAllMocks()
  outcome = {
    result: {
      state: 'failed',
      error: { name: 'Error', message: 'budget exhausted' }
    }
  }
  mocks.submit.mockReturnValue({ outcome: Promise.resolve(outcome) })
  input = {
    runId: 'cli-run',
    instruction: 'task',
    workspace: '/workspace',
    chatUuid: 'cli:run',
    approval: 'deny',
    maxSteps: 3,
    signal: new AbortController().signal,
    profile: {
      modelContext: {} as unknown as CliRuntimeRunInput['profile']['modelContext'],
      modelRef: { accountId: 'cli', modelId: 'model' },
      tools: [],
      secrets: []
    },
    onPrepared: vi.fn(),
    eventSink: { handle: vi.fn(), emit: vi.fn() }
  }
})

it('uses shared submission with explicit batch policies and preserves unsuccessful outcomes', async () => {
  expect(await runCliRuntime(input)).toBe(outcome)
  const [request, options] = mocks.submit.mock.calls[0]
  expect(request).toMatchObject({
    submissionId: input.runId,
    chatUuid: input.chatUuid,
    input: { source: 'cli', textCtx: 'task', permissionApprovalMode: 'manual' }
  })
  expect(options).toMatchObject({
    execution: { maxSteps: 3 },
    signal: input.signal,
    postRunJobs: false
  })
  expect(options.onPrepared).toBe(input.onPrepared)
  await expect(options.toolConfirmationRequester.request({})).resolves.toMatchObject({
    approved: false
  })
  expect(mocks.wait).toHaveBeenCalledTimes(1)
})

it('allows automatic approval through the same parent confirmation channel', async () => {
  input.approval = 'auto'
  await runCliRuntime(input)
  const options: RunSubmissionOptions = mocks.submit.mock.calls[0][1]
  await expect(
    options.toolConfirmationRequester!.request({
      toolCallId: 'call',
      name: 'exec'
    })
  ).resolves.toEqual({ approved: true })
})

it('cancels on event output failure and retains the runtime transcript for artifact publication', async () => {
  input.eventSink.handle = vi.fn().mockRejectedValue(new Error('stdout closed'))
  outcome.agentResult = {
    status: 'aborted',
    transcript: { records: [{ kind: 'user' }] }
  } as unknown as NonNullable<RunOutcome['agentResult']>
  mocks.submit.mockImplementation((_request, options) => ({
    outcome: (async (): Promise<RunOutcome> => {
      await options.agentEventSinks[0].handle({ type: 'step.started' })
      return outcome
    })()
  }))
  const result = await runCliRuntime(input)
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(input.runId)
  expect(result.agentResult).toBe(outcome.agentResult)
  expect(result.result).toMatchObject({
    state: 'failed',
    error: { message: 'stdout closed' }
  })
})
