import { describe, expect, it, vi } from 'vitest'

const {
  mainAgentRuntimeRunnerConstructorMock,
  toolResultCompactionSchedulerMock,
  notificationSinkConstructorMock
} = vi.hoisted(() => ({
  mainAgentRuntimeRunnerConstructorMock: vi.fn(),
  notificationSinkConstructorMock: vi.fn(),
  toolResultCompactionSchedulerMock: {
    schedule: vi.fn()
  }
}))

vi.mock('../DefaultMainAgentRuntimeRunner', () => ({
  DefaultMainAgentRuntimeRunner: class {
    constructor(...args: unknown[]) {
      mainAgentRuntimeRunnerConstructorMock(...args)
    }
  }
}))

vi.mock('@main/orchestration/chat/toolResultCompaction/ToolResultCompactionScheduler', () => ({
  toolResultCompactionScheduler: toolResultCompactionSchedulerMock
}))

vi.mock('@main/notifications/AgentNotificationSink', () => ({
  AgentNotificationSink: class {
    constructor(...args: unknown[]) {
      notificationSinkConstructorMock(...args)
    }
  }
}))

vi.mock('@main/orchestration/chat/maintenance', () => ({
  CompressionExecutionService: class {},
  TitleGenerationService: class {}
}))

vi.mock('@main/orchestration/chat/postRun', () => ({
  PostRunJobService: class {}
}))

vi.mock('@main/hosts/chat/ChatAgentAdapter', () => ({
  ChatAgentAdapter: class {}
}))

vi.mock('../../infrastructure', () => ({
  RunEventEmitterFactory: class {},
  ToolConfirmationManager: class {}
}))

vi.mock('../RunManager', () => ({
  RunManager: class {}
}))

import { RunRuntimeFactory } from '../RunRuntimeFactory'

describe('RunRuntimeFactory', () => {
  it('injects production tool-result and notification dependencies', () => {
    new RunRuntimeFactory().create()

    expect(mainAgentRuntimeRunnerConstructorMock).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.objectContaining({
        toolResultCompactionTrigger: toolResultCompactionSchedulerMock,
        notificationSinkFactory: expect.any(Function)
      })
    )

    const runnerOptions = mainAgentRuntimeRunnerConstructorMock.mock.calls[0][2] as {
      notificationSinkFactory: (
        chatTitle: string,
        options: { notifyOnFailure: boolean }
      ) => unknown
    }
    runnerOptions.notificationSinkFactory('Recurring check', { notifyOnFailure: false })
    expect(notificationSinkConstructorMock).toHaveBeenCalledWith(
      'Recurring check',
      { notifyOnFailure: false }
    )
  })
})
