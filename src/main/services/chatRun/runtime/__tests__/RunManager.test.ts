import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateSubmissionIdError } from '../../errors'

const {
  emitAcceptedMock,
  runMock,
  cancelMock
} = vi.hoisted(() => ({
  emitAcceptedMock: vi.fn(),
  runMock: vi.fn(async () => ({ assistantMessageId: 1, state: 'completed' })),
  cancelMock: vi.fn()
}))

vi.mock('../AgentRun', () => ({
  AgentRun: class {
    chatUuid?: string
    constructor(input: { chatUuid?: string }) {
      this.chatUuid = input.chatUuid
    }
    emitAccepted = emitAcceptedMock
    run = runMock
    cancel = cancelMock
  }
}))

vi.mock('../../infrastructure', () => ({
  ChatRunEventEmitter: class {},
  ChatRunEventEmitterFactory: class {
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
  }
}))

vi.mock('@main/services/chatPostRun', () => ({
  PostRunJobService: class {}
}))

vi.mock('@main/services/hostAdapters/chat', () => ({
  ChatAgentAdapter: class {},
  AssistantStepFactory: class {}
}))

vi.mock('@main/services/agentCore/run-kernel', () => ({
  AgentRunKernel: class {}
}))

import { RunManager } from '../RunManager'

const createManager = () =>
  new RunManager({
    toolConfirmationManager: new (class {
      request = vi.fn(async () => ({ approved: true }))
      resolve = vi.fn()
    })() as any,
    eventEmitterFactory: new (class {
      create() {
        return {}
      }

      createOptional() {
        return {}
      }
    })() as any,
    agentRunKernel: new (class {})() as any,
    chatAgentAdapter: new (class {})() as any,
    assistantStepFactory: new (class {})() as any,
    postRunJobService: new (class {})() as any
  })

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
})
