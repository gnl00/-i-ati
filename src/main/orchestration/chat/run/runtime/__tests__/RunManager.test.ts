import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateSubmissionIdError } from '../errors'

const {
  emitAcceptedMock,
  runMock,
  cancelMock,
  setPermissionApprovalModeMock,
  constructorArgsMock
} = vi.hoisted(() => ({
  emitAcceptedMock: vi.fn(),
  runMock: vi.fn(async () => ({ assistantMessageId: 1, state: 'completed' })),
  cancelMock: vi.fn(),
  setPermissionApprovalModeMock: vi.fn(),
  constructorArgsMock: vi.fn()
}))

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
  })()
  const manager = new RunManager({
    toolConfirmationManager: toolConfirmationManager as any,
    eventEmitterFactory: new (class {
      create() {
        return {}
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
  return { manager, toolConfirmationManager }
}

const createManager = () => createManagerWithDeps().manager

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
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
  beforeEach(() => {
    emitAcceptedMock.mockReset()
    runMock.mockReset()
    runMock.mockResolvedValue({ assistantMessageId: 1, state: 'completed' })
    cancelMock.mockReset()
    setPermissionApprovalModeMock.mockReset()
    constructorArgsMock.mockReset()
  })

  it('returns accepted immediately from start and blocks duplicate submission ids while active', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    const result = await manager.start(input)

    expect(result).toEqual({
      accepted: true,
      submissionId: 'submission-1'
    })
    expect(emitAcceptedMock).toHaveBeenCalledTimes(1)
    await expect(manager.start(input)).rejects.toBeInstanceOf(DuplicateSubmissionIdError)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('delegates cancel to the active run', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.start(input)
    manager.cancel(input.submissionId)

    expect(cancelMock).toHaveBeenCalledTimes(1)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('releases pending confirmations when cancelling an active run', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const { manager, toolConfirmationManager } = createManagerWithDeps()
    await manager.start(input)
    manager.cancel(input.submissionId)

    expect(toolConfirmationManager.cancelForSubmission).toHaveBeenCalledWith(input.submissionId)

    deferred.resolve({ assistantMessageId: 11, state: 'completed' })
    await deferred.promise
  })

  it('keeps a cancelled run active until its async cleanup completes', async () => {
    const deferred = createDeferred<{ assistantMessageId?: number; state: 'completed' }>()
    runMock.mockReturnValueOnce(deferred.promise as any)

    const manager = createManager()
    await manager.start({
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
    await manager.start({
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

  it('returns the run result from execute', async () => {
    const manager = createManager()

    const result = await manager.execute(input)

    expect(result).toEqual({ assistantMessageId: 1, state: 'completed' })
    expect(emitAcceptedMock).toHaveBeenCalledTimes(1)
    expect(runMock).toHaveBeenCalledTimes(1)
  })

  it('passes host render sinks into the created run runtime', async () => {
    const manager = createManager()
    const hostRenderSinks = [{ handle: vi.fn() }]

    await manager.execute(input, [], hostRenderSinks as any)

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
    await manager.start({
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
})
