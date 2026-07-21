import { describe, expect, it, vi } from 'vitest'

const {
  mainAgentRuntimeRunnerConstructorMock,
  toolResultCompactionSchedulerMock
} = vi.hoisted(() => ({
  mainAgentRuntimeRunnerConstructorMock: vi.fn(),
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
  AgentNotificationSink: class {}
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
  })
})
