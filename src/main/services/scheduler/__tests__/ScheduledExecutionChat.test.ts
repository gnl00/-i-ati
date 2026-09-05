import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScheduledExecutionChat, ScheduledExecutionChatCancelledError } from '../ScheduledExecutionChat'

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  uuid: vi.fn(() => 'execution-1')
}))

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/ati-user-data') } }))
vi.mock('node:fs/promises', () => ({ default: { mkdir: mocks.mkdir } }))
vi.mock('uuid', () => ({ v4: mocks.uuid }))

describe('ScheduledExecutionChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mkdir.mockResolvedValue(undefined)
    mocks.uuid.mockReturnValue('execution-1')
  })

  it('creates an empty explicitly scoped chat with current source settings', async () => {
    const modelRef = { accountId: 'account-1', modelId: 'model-1' }
    const sourceChat: ChatEntity = {
      id: 1,
      uuid: 'source-1',
      title: 'Source chat',
      messages: [11, 12],
      msgCount: 2,
      modelRef,
      workspacePath: '/tmp/source-workspace',
      userInstruction: 'source instruction',
      permissionApprovalMode: 'auto',
      hostBindings: [{ hostType: 'test', hostChatId: 'host-1', status: 'active' }],
      parentChatUuid: 'parent-1',
      forkedFromMessageId: 10,
      forkedAt: 900,
      createTime: 1,
      updateTime: 2
    }
    const chat = await createScheduledExecutionChat({
      task: { goal: '  Generate a report  ' },
      scheduledFor: Date.parse('2026-09-03T02:00:00Z'),
      attempt: 2,
      sourceChat,
      modelRef,
      canContinue: () => true
    })

    expect(mocks.mkdir).toHaveBeenCalledWith('/tmp/source-workspace', { recursive: true })
    expect(chat).toMatchObject({
      uuid: 'execution-1',
      title: 'Generate a report · 2026-09-03T02:00:00.000Z · attempt 2',
      messages: [],
      msgCount: 0,
      modelRef,
      workspacePath: '/tmp/source-workspace',
      userInstruction: '',
      permissionApprovalMode: 'auto'
    })
    expect(chat).not.toHaveProperty('id')
    expect(chat).not.toHaveProperty('parentChatUuid')
    expect(chat).not.toHaveProperty('forkedFromMessageId')
    expect(chat).not.toHaveProperty('hostBindings')
  })

  it('uses a fresh default workspace and rechecks cancellation after mkdir', async () => {
    mocks.uuid.mockReturnValue('execution-2')
    let canContinue = true
    const chat = await createScheduledExecutionChat({
      task: { goal: 'run' },
      scheduledFor: 1000,
      attempt: 1,
      sourceChat: { permissionApprovalMode: 'manual' },
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      canContinue: () => canContinue
    })
    expect(mocks.mkdir).toHaveBeenCalledWith('/tmp/ati-user-data/workspaces/execution-2', { recursive: true })
    expect(chat.workspacePath).toBe('./workspaces/execution-2')

    canContinue = false
    await expect(createScheduledExecutionChat({
      task: { goal: 'cancelled' },
      scheduledFor: 1000,
      attempt: 1,
      sourceChat: {},
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      canContinue: () => canContinue
    })).rejects.toBeInstanceOf(ScheduledExecutionChatCancelledError)
  })
})
