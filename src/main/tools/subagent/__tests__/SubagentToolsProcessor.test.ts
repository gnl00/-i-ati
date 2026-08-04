import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  spawnMock,
  waitMock
} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  waitMock: vi.fn()
}))

vi.mock('@main/services/subagent/subagent-run-service', () => ({
  default: {
    spawn: spawnMock,
    wait: waitMock
  }
}))

import {
  processSubagent,
  processSubagentSpawn
} from '../SubagentToolsProcessor'

describe('SubagentToolsProcessor', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    waitMock.mockReset()
  })

  it('returns Missing required parameter: action when action is absent', async () => {
    const result = await processSubagent({})

    expect(result).toEqual({ success: false, message: 'Missing required parameter: action' })
  })

  it('rejects unknown actions with an expected-action error', async () => {
    const result = await processSubagent({ action: 'cancel' })

    expect(result).toEqual({ success: false, message: 'Invalid action: cancel. Expected one of: spawn, wait' })
  })

  it('dispatches action spawn to processSubagentSpawn', async () => {
    spawnMock.mockResolvedValue({
      id: 'agent-1',
      status: 'running',
      role: 'general',
      task: 'Review the diff',
      created_at: 1
    })

    const result = await processSubagent({
      action: 'spawn',
      task: 'Review the diff',
      model_ref: { accountId: 'acc-1', modelId: 'model-1' }
    })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual(expect.objectContaining({
      success: true,
      message: 'Subagent spawned in background.',
      subagent: expect.objectContaining({ id: 'agent-1', status: 'running' })
    }))
  })

  it('passes normalized spawn inputs to the run service', async () => {
    spawnMock.mockResolvedValue({
      id: 'agent-2',
      status: 'queued',
      role: 'reviewer',
      task: 'Review the diff',
      created_at: 1
    })

    await processSubagent({
      action: 'spawn',
      task: '  Review the diff  ',
      role: 'reviewer',
      context_mode: 'minimal',
      files: ['src/main/index.ts', ''],
      chat_uuid: 'chat-1',
      model_ref: { accountId: 'acc-1', modelId: 'model-1' },
      parent_submission_id: 'submission-1'
    })

    expect(spawnMock).toHaveBeenCalledWith({
      task: 'Review the diff',
      role: 'reviewer',
      contextMode: 'minimal',
      files: ['src/main/index.ts'],
      chatUuid: 'chat-1',
      modelRef: { accountId: 'acc-1', modelId: 'model-1' },
      parentSubmissionId: 'submission-1',
      permissionApprovalMode: 'manual'
    })
  })

  it('dispatches action wait to processSubagentWait', async () => {
    waitMock.mockResolvedValue({
      id: 'agent-1',
      status: 'completed',
      role: 'general',
      task: 'Review the diff',
      created_at: 1,
      finished_at: 2,
      summary: 'Diff reviewed.'
    })

    const result = await processSubagent({ action: 'wait', subagent_id: 'agent-1', timeout_seconds: 5 })

    expect(waitMock).toHaveBeenCalledWith('agent-1', 5000)
    expect(result).toEqual(expect.objectContaining({
      success: true,
      message: 'Subagent completed.',
      subagent: expect.objectContaining({ id: 'agent-1', status: 'completed' })
    }))
  })

  it('rejects a spawn without a task', async () => {
    const result = await processSubagentSpawn({ task: '   ' })

    expect(result).toEqual({ success: false, message: 'task is required' })
  })

  it('rejects a spawn without a model ref', async () => {
    const result = await processSubagentSpawn({ task: 'Review the diff' })

    expect(result).toEqual({ success: false, message: 'model_ref is required' })
  })

  it('rejects a wait without a subagent id', async () => {
    const result = await processSubagent({ action: 'wait' })

    expect(result).toEqual({ success: false, message: 'subagent_id is required' })
  })

  it('reports an unknown wait target', async () => {
    waitMock.mockResolvedValue(null)

    const result = await processSubagent({ action: 'wait', subagent_id: 'missing' })

    expect(result).toEqual({ success: false, message: 'Subagent not found.' })
  })
})
