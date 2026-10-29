import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subagentRuntimeBridge } from '@main/services/subagent/subagent-runtime-bridge'
import subagentRunService from '@main/services/subagent/subagent-run-service'
import { DuplicateSubmissionIdError } from '../errors'

const {
  emitAcceptedMock,
  runMock,
  cancelMock,
  steerMock,
  setPermissionApprovalModeMock,
  eventEmitterMetaMock,
  constructorArgsMock
} = vi.hoisted(() => ({
  emitAcceptedMock: vi.fn(),
  runMock: vi.fn(async () => ({ assistantMessageId: 1, state: 'completed' })),
  cancelMock: vi.fn(),
  steerMock: vi.fn(() => ({ accepted: true })),
  setPermissionApprovalModeMock: vi.fn(),
  eventEmitterMetaMock: vi.fn(),
  constructorArgsMock: vi.fn()
}))

vi.mock('@main/services/telegram/TelegramApprovalTargets', () => ({ resolveTelegramApprovalTargets: vi.fn(() => []) }))

vi.mock('../AgentRun', () => ({
  AgentRun: class {
    submissionId: string
    chatUuid?: string
    constructor(input: { submissionId: string; chatUuid?: string }, services: unknown, runtime: unknown) {
      this.submissionId = input.submissionId
      this.chatUuid = input.chatUuid
      constructorArgsMock({ input, services, runtime })
    }
    emitAccepted = emitAcceptedMock
    run = runMock
    cancel = cancelMock
    steer = steerMock
    setPermissionApprovalMode = setPermissionApprovalModeMock
  }
}))

vi.mock('../../infrastructure', () => ({
  RunEventEmitter: class {},
  RunEventEmitterFactory: class {
    create() {
      return {}
    }

    createOptional() {
      return {}
    }
  },
  ToolConfirmationManager: class {
    request = vi.fn(async () => ({ approved: true }))
    resolve = vi.fn()
    cancelForSubmission = vi.fn()
    approvePendingForSubmission = vi.fn()
    cancelForSubagent = vi.fn()
  }
}))

vi.mock('@main/orchestration/chat/postRun', () => ({
  PostRunJobService: class {}
}))

import { RunManager } from '../RunManager'

const createManagerWithDeps = () => {
  const toolConfirmationManager = new (class {
    request = vi.fn(async () => ({ approved: true }))
    resolve = vi.fn()
    cancelForSubmission = vi.fn()
    approvePendingForSubmission = vi.fn()
    cancelForSubagent = vi.fn()
  })()
  const toolQuestionManager = new (class {
    cancelForSubmission = vi.fn()
  })()
  const manager = new RunManager({
    toolConfirmationManager: toolConfirmationManager as any,
    toolQuestionManager: toolQuestionManager as any,
    eventEmitterFactory: new (class {
      create(meta: unknown): object {
        eventEmitterMetaMock(meta)
        return { ...(meta as object), emit: vi.fn() }
      }

      createOptional() {
        return {}
      }
    })() as any,
    mainAgentRuntimeRunner: new (class {
      run = vi.fn()
    })() as any,
    chatAgentAdapter: new (class {})() as any,
    postRunJobService: new (class {})() as any
  })
  return { manager, toolConfirmationManager, toolQuestionManager }
}

const createManager = () => createManagerWithDeps().manager

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const input = {
  submissionId: 'submission-1',
  chatId: 1,
  modelRef: { accountId: 'account-1', modelId: 'model-1' },
  input: {
    textCtx: 'hello',
    mediaCtx: [],
    stream: true
  }
} as any

describe('RunManager', () => {
  it('registers real child approval and status wiring and retains it after normal parent completion', async () => {
    const deferred = createDeferred<{ assistantMessageId: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise)
    const { manager, toolConfirmationManager } = createManagerWithDeps()
    const handle = manager.submit({ ...input, chatUuid: 'chat' })
    const release = subagentRuntimeBridge.retain(input.submissionId)
    deferred.resolve({ assistantMessageId: 1, state: 'completed' })
    await handle.completion
    expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledWith(input.submissionId, 'parent_finished', false)
    await expect(subagentRuntimeBridge.request(input.submissionId, { toolCallId: 'tool', name: 'exec', agent: { kind: 'subagent', subagentId: 'child' } })).resolves.toEqual({ approved: true })
    expect(toolConfirmationManager.request).toHaveBeenCalledWith(expect.objectContaining({ submissionId: input.submissionId }), expect.objectContaining({ toolCallId: 'tool' }), [])
    release()
    await expect(subagentRuntimeBridge.request(input.submissionId, { toolCallId: 'tool', name: 'exec' })).resolves.toMatchObject({ approved: false })
  })

  it('cascades explicit Stop only to the resolved parent submission', async () => {
    const deferred = createDeferred<{ assistantMessageId: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise)
    const cancel = vi.spyOn(subagentRunService, 'cancelForParent')
    const manager = createManager()
    const handle = manager.submit({ ...input, chatUuid: 'chat' })
    expect(manager.cancel({ submissionId: input.submissionId, chatUuid: 'wrong' })).toMatchObject({ cancelled: false })
    expect(cancel).not.toHaveBeenCalled()
    manager.cancel({ chatUuid: 'chat' })
    expect(cancel).toHaveBeenCalledExactlyOnceWith(input.submissionId)
    deferred.resolve({ assistantMessageId: 1, state: 'completed' })
    await handle.completion
    cancel.mockRestore()
  })

  beforeEach(() => {
    emitAcceptedMock.mockReset()
    runMock.mockReset()
    runMock.mockResolvedValue({ assistantMessageId: 1, state: 'completed' })
    cancelMock.mockReset()
    steerMock.mockReset()
    steerMock.mockReturnValue({ accepted: true })
    setPermissionApprovalModeMock.mockReset()
    constructorArgsMock.mockReset()
    eventEmitterMetaMock.mockReset()
  })

  it('returns a handle immediately and blocks duplicate submission ids while active', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    const result = manager.submit(input)

    expect(result.submissionId).toBe('submission-1')
    expect(emitAcceptedMock).toHaveBeenCalledTimes(1)
    expect(eventEmitterMetaMock).toHaveBeenCalledWith({
      submissionId: 'submission-1', chatId: 1, chatUuid: undefined
    })
    expect(() => manager.submit(input)).toThrow(DuplicateSubmissionIdError)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('cancels by exact active submission and returns its identity', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.submit(input)
    const result = manager.cancel(input.submissionId)

    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      cancelled: true,
      submissionId: input.submissionId
    })

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('cancels the active run by chatUuid', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.submit({ ...input, chatUuid: 'chat-1' })

    expect(manager.cancel({ chatUuid: 'chat-1' })).toEqual({
      cancelled: true,
      submissionId: input.submissionId
    })
    expect(cancelMock).toHaveBeenCalledTimes(1)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('rejects a submission and chat mismatch while keeping the run active', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.submit({ ...input, chatUuid: 'chat-1' })

    expect(manager.cancel({
      submissionId: input.submissionId,
      chatUuid: 'chat-2'
    })).toEqual({ cancelled: false, reason: 'chat_mismatch' })
    expect(cancelMock).not.toHaveBeenCalled()
    expect(manager.hasActiveRunForChat('chat-1')).toBe(true)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('returns run_not_found when cancelling an inactive chat', () => {
    const manager = createManager()

    expect(manager.cancel({ chatUuid: 'chat-missing' })).toEqual({
      cancelled: false,
      reason: 'run_not_found'
    })
  })

  it('preserves pending-interaction cleanup for a missing exact submission', () => {
    const { manager, toolConfirmationManager, toolQuestionManager } = createManagerWithDeps()

    expect(manager.cancel('submission-missing')).toEqual({
      cancelled: false,
      reason: 'run_not_found'
    })
    expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledWith('submission-missing')
    expect(toolQuestionManager.cancelForSubmission).toHaveBeenCalledWith('submission-missing')
  })

  it('routes steer only when submission and chat identities both match', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)
    const manager = createManager()
    await manager.submit({ ...input, chatUuid: 'chat-1' })

    expect(manager.steer({
      submissionId: input.submissionId,
      chatUuid: 'chat-2',
      queueItemId: 'queue-1',
      text: 'guide',
      images: []
    })).toEqual({ accepted: false, reason: 'chat_mismatch' })
    expect(steerMock).not.toHaveBeenCalled()

    expect(manager.steer({
      submissionId: input.submissionId,
      chatUuid: 'chat-1',
      queueItemId: 'queue-1',
      text: 'guide',
      images: []
    })).toEqual({ accepted: true })
    expect(steerMock).toHaveBeenCalledWith({
      queueItemId: 'queue-1',
      text: 'guide',
      images: []
    })

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('releases pending confirmations when cancelling an active run', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const { manager, toolConfirmationManager, toolQuestionManager } = createManagerWithDeps()
    await manager.submit(input)
    expect(manager.cancel(input.submissionId)).toEqual({
      cancelled: true,
      submissionId: input.submissionId
    })

    expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledWith(input.submissionId)
    expect(toolQuestionManager.cancelForSubmission).toHaveBeenCalledWith(input.submissionId)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('keeps a cancelled run active until its async cleanup completes', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.submit({
      ...input,
      chatUuid: 'chat-1'
    })
    manager.cancel(input.submissionId)

    expect(manager.hasActiveRunForChat('chat-1')).toBe(true)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
    await Promise.resolve()

    expect(manager.hasActiveRunForChat('chat-1')).toBe(false)
  })

  it('tracks whether a chat already has an active run', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.submit({
      ...input,
      chatUuid: 'chat-1'
    })

    expect(manager.hasActiveRunForChat('chat-1')).toBe(true)
    expect(manager.hasActiveRunForChat('chat-2')).toBe(false)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
    await Promise.resolve()

    expect(manager.hasActiveRunForChat('chat-1')).toBe(false)
  })

  it('returns active chat identity and clears it after run completion', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.submit({ ...input, chatUuid: 'chat-1' })

    expect(manager.getActiveRunIdentityForChat('chat-1')).toEqual({
      submissionId: input.submissionId,
      chatUuid: 'chat-1'
    })

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
    await Promise.resolve()

    expect(manager.getActiveRunIdentityForChat('chat-1')).toBeNull()
  })

  it('returns the run result from completion', async () => {
    const manager = createManager()

    const handle = manager.submit(input)
    const result = await handle.completion

    expect(result).toEqual({ assistantMessageId: 1, state: 'completed' })
    expect(emitAcceptedMock).toHaveBeenCalledTimes(1)
    expect(runMock).toHaveBeenCalledTimes(1)
  })

  it('rejects failed and aborted completion and releases each run once', async () => {
    const { manager, toolConfirmationManager, toolQuestionManager } = createManagerWithDeps()
    runMock.mockResolvedValueOnce({
      assistantMessageId: 0,
      state: 'failed',
      error: { name: 'RunError', message: 'boom' }
    } as unknown as Awaited<ReturnType<typeof runMock>>)
    await expect(manager.submit(input).completion).rejects.toMatchObject({
      name: 'RunError', message: 'boom'
    })
    expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledTimes(1)
    expect(toolQuestionManager.cancelForSubmission).toHaveBeenCalledTimes(1)
    expect(manager.cancel(input.submissionId)).toEqual({ cancelled: false, reason: 'run_not_found' })
    expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledTimes(2)
    expect(toolQuestionManager.cancelForSubmission).toHaveBeenCalledTimes(2)

    runMock.mockResolvedValueOnce({ assistantMessageId: 0, state: 'aborted' })
    await expect(manager.submit(input).completion).rejects.toBeInstanceOf(Error)
    expect(toolQuestionManager.cancelForSubmission).toHaveBeenCalledTimes(3)
  })

  it('resolves terminal facts while completion retains its rejection contract', async () => {
    runMock.mockResolvedValueOnce({
      state: 'failed',
      error: { name: 'Error', message: 'failed' }
    } as unknown as Awaited<ReturnType<typeof runMock>>)
    const handle = createManager().submit(input)
    await expect(handle.outcome).resolves.toMatchObject({
      result: { state: 'failed' }
    })
    await expect(handle.completion).rejects.toThrow('failed')
  })

  it.each([false, true])(
    'routes external cancellation through registry cleanup (already aborted=%s)',
    async alreadyAborted => {
      const controller = new AbortController()
      if (alreadyAborted) controller.abort()
      const deferred = createDeferred<Awaited<ReturnType<typeof runMock>>>()
      runMock.mockReturnValueOnce(deferred.promise)
      const { manager, toolConfirmationManager } = createManagerWithDeps()
      const handle = manager.submit(input, [], [], {
        signal: controller.signal
      })
      if (!alreadyAborted) controller.abort()
      expect(cancelMock).toHaveBeenCalledTimes(1)
      expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledWith(
        input.submissionId
      )
      deferred.resolve({ state: 'completed', assistantMessageId: 1 })
      await handle.outcome
      expect(manager.hasActiveRunForChat('chat')).toBe(false)
    }
  )

  it('shares the host confirmation requester with children and validates execution budget before admission', async () => {
    const manager = createManager()
    expect(() =>
      manager.submit(input, [], [], { execution: { maxSteps: 0 } })
    ).toThrow('Invalid run execution budget')
    const requester = {
      request: vi.fn(async () => ({ approved: false, reason: 'batch denied' }))
    }
    const deferred = createDeferred<Awaited<ReturnType<typeof runMock>>>()
    runMock.mockReturnValueOnce(deferred.promise)
    const handle = manager.submit(input, [], [], {
      toolConfirmationRequester: requester
    })
    await expect(
      subagentRuntimeBridge.request(input.submissionId, {
        toolCallId: 'child',
        name: 'exec'
      })
    ).resolves.toMatchObject({ approved: false, reason: 'batch denied' })
    deferred.resolve({ state: 'completed', assistantMessageId: 1 })
    await handle.completion
  })

  it('rejects invalid admission before accepting a run', () => {
    const manager = createManager()
    expect(() => manager.submit({ ...input, submissionId: ' ' })).toThrow('Invalid run submission')
    expect(() => manager.submit({ ...input, modelRef: undefined })).toThrow('Invalid run submission')
    expect(emitAcceptedMock).not.toHaveBeenCalled()
  })

  it('releases an admitted run when acceptance emission fails', () => {
    const { manager, toolConfirmationManager } = createManagerWithDeps()
    emitAcceptedMock.mockImplementationOnce(() => { throw new Error('emit failed') })

    expect(() => manager.submit(input)).toThrow('emit failed')
    expect(runMock).not.toHaveBeenCalled()
    expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledOnce()
    expect(manager.submit(input).submissionId).toBe(input.submissionId)
  })

  it('passes host render sinks into the created run runtime', async () => {
    const manager = createManager()
    const hostRenderSinks = [{ handle: vi.fn() }]

    await manager.submit(input, [], hostRenderSinks as any).completion

    expect(constructorArgsMock).toHaveBeenCalledWith(expect.objectContaining({
      runtime: expect.objectContaining({
        hostRenderSinks
      })
    }))
  })

  it('updates permission approval mode for the active chat run', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const { manager, toolConfirmationManager } = createManagerWithDeps()
    await manager.submit({
      ...input,
      chatUuid: 'chat-1'
    })

    const updated = manager.updateActiveRunPermissionApprovalMode('chat-1', 'auto')

    expect(updated).toBe(true)
    expect(setPermissionApprovalModeMock).toHaveBeenCalledWith('auto')
    expect(toolConfirmationManager.approvePendingForSubmission).toHaveBeenCalledWith(
      input.submissionId
    )

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })
  it('rejects an ID retained by an older child without leaving a new active run', async () => {
    subagentRuntimeBridge.register('retained-id', {
      emitter: { submissionId: 'retained-id', chatUuid: 'chat', setChatMeta: vi.fn(), emit: vi.fn() },
      requester: { request: vi.fn(async () => ({ approved: false })) }, cancelConfirmation: vi.fn()
    })
    const release = subagentRuntimeBridge.retain('retained-id')
    subagentRuntimeBridge.releaseParent('retained-id')
    const manager = createManager()
    expect(() => manager.submit({ ...input, submissionId: 'retained-id', chatUuid: 'chat' })).toThrow('already registered')
    expect(manager.hasActiveRunForChat('chat')).toBe(false)
    release()
    await expect(manager.submit({ ...input, submissionId: 'retained-id', chatUuid: 'chat' }).completion).resolves.toMatchObject({ state: 'completed' })
  })

})
