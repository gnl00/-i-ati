import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  spawnMock,
  waitMock,
  cancelMock,
  getMock,
  listMock, inspectMock, messagesMock, sendMock, followupMock
} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  waitMock: vi.fn(),
  cancelMock: vi.fn(),
  getMock: vi.fn(),
  listMock: vi.fn(), inspectMock: vi.fn(), messagesMock: vi.fn(), sendMock: vi.fn(), followupMock: vi.fn()
}))

vi.mock('@main/services/subagent/subagent-run-service', () => ({
  default: {
    spawn: spawnMock,
    wait: waitMock,
    cancel: cancelMock,
    get: getMock,
    list: listMock, inspect: inspectMock, messagesForRun: messagesMock, sendMessage: sendMock, followup: followupMock
  }
}))

import {
  processSubagent,
  processSubagentSpawn
} from '../SubagentToolsProcessor'

describe('SubagentToolsProcessor', () => {
  it('cancels only a target in the current chat and uses trusted parent identity', async () => {
    getMock.mockReturnValue({ id: 'agent', parent_chat_uuid: 'chat' })
    cancelMock.mockReturnValue({ id: 'agent', status: 'cancelling' })
    expect(await processSubagent({ action: 'cancel', subagent_id: 'agent' }, { chatUuid: 'chat' })).toMatchObject({ success: true, subagent: { status: 'cancelling' } })
    expect(cancelMock).toHaveBeenCalledWith('agent')
    cancelMock.mockClear()
    expect(await processSubagent({ action: 'cancel', subagent_id: 'agent' }, { chatUuid: 'other' })).toMatchObject({ success: false })
    expect(cancelMock).not.toHaveBeenCalled()
    spawnMock.mockResolvedValue({ id: 'new' })
    await processSubagent({ action: 'spawn', task: 'work', chat_uuid: 'spoofed', parent_submission_id: 'spoofed', model_ref: { accountId: 'a', modelId: 'm' } }, { chatUuid: 'chat', submissionId: 'parent' })
    expect(spawnMock).toHaveBeenLastCalledWith(expect.objectContaining({ chatUuid: 'chat', parentSubmissionId: 'parent' }))
  })

  it('reports admission failure and passes a wait abort signal without cancelling its target', async () => {
    spawnMock.mockRejectedValue(new Error('Subagent queue is full.'))
    expect(await processSubagentSpawn({ task: 'work', model_ref: { accountId: 'a', modelId: 'm' } })).toMatchObject({ success: false, message: 'Subagent queue is full.' })
    const controller = new AbortController()
    waitMock.mockResolvedValue({ id: 'agent', status: 'running' })
    await processSubagent({ action: 'wait', subagent_id: 'agent', timeout_seconds: 999 }, { signal: controller.signal })
    expect(waitMock).toHaveBeenLastCalledWith('agent', 300000, controller.signal)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    spawnMock.mockReset()
    waitMock.mockReset()
    cancelMock.mockReset()
    getMock.mockReset()
    for (const mock of [listMock, inspectMock, messagesMock, sendMock, followupMock]) mock.mockReset()
  })

  it('returns Missing required parameter: action when action is absent', async () => {
    const result = await processSubagent({})

    expect(result).toEqual({ success: false, message: 'Missing required parameter: action' })
  })

  it('rejects unknown actions with an expected-action error', async () => {
    const result = await processSubagent({ action: 'unknown' })

    expect(result).toEqual({ success: false, message: 'Invalid action: unknown. Expected one of: spawn, wait, cancel, inspect, list, send_message, followup_task, resume, interrupt' })
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
  it.each(['followup_task', 'resume'])('routes %s with current policy, identity and abort signal', async action => {
    const controller = new AbortController()
    getMock.mockReturnValue({ id: 'child', parent_chat_uuid: 'chat' })
    followupMock.mockResolvedValue({ id: 'child', run_id: 'next-run', status: 'queued' })
    const result = await processSubagent({ action, subagent_id: 'child', message_id: 'request', task: 'Review again', permission_approval_mode: 'auto' }, { chatUuid: 'chat', submissionId: 'parent', signal: controller.signal })
    expect(result).toMatchObject({ success: true, subagent: { run_id: 'next-run' } })
    expect(followupMock).toHaveBeenCalledWith('child', 'request', 'Review again', 'parent', 'auto', controller.signal)
  })

  it('returns persisted evidence and inbox receipts, scopes listing, and binds interruption to a run', async () => {
    getMock.mockReturnValue({ id: 'child', parent_chat_uuid: 'chat' })
    sendMock.mockReturnValue({ id: 'receipt', status: 'pending' })
    expect(await processSubagent({ action: 'send_message', subagent_id: 'child', message_id: 'message', message: 'Information' }, { chatUuid: 'chat' })).toMatchObject({ success: true, message: expect.stringContaining('pending') })
    expect(sendMock).toHaveBeenCalledWith('child', 'message', 'Information', 'chat')
    inspectMock.mockReturnValue({ record: { id: 'child', run_id: 'old-run' }, inputJson: '{}', transcriptJson: '{"records":[]}' })
    messagesMock.mockReturnValue([{ id: 'message' }])
    expect(await processSubagent({ action: 'inspect', subagent_id: 'child', run_id: 'old-run' }, { chatUuid: 'chat' })).toMatchObject({ evidence: { transcript: { records: [] }, messages: [{ id: 'message' }] } })
    listMock.mockReturnValue([{ id: 'child' }])
    expect(await processSubagent({ action: 'list' }, { chatUuid: 'chat' })).toMatchObject({ subagents: [{ id: 'child' }] })
    cancelMock.mockReturnValue({ id: 'child', status: 'cancelled' })
    await processSubagent({ action: 'interrupt', subagent_id: 'child', run_id: 'old-run' }, { chatUuid: 'chat' })
    expect(cancelMock).toHaveBeenCalledWith('child', 'user_cancelled', 'old-run')
  })

  it('rejects malformed revision cursors and missing continuation inputs', async () => {
    expect(await processSubagent({ action: 'wait', subagent_id: 'child', after_revision: -1 })).toMatchObject({ success: false })
    expect(await processSubagent({ action: 'followup_task', subagent_id: 'child' })).toMatchObject({ success: false })
    expect(followupMock).not.toHaveBeenCalled()
  })

})
