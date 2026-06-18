import { describe, expect, it } from 'vitest'
import { toChatEntity, toChatRow } from '../ChatMapper'

describe('chatMapper', () => {
  it('maps a chat entity into a chat row', () => {
    expect(toChatRow({
      uuid: 'chat-1',
      title: 'Test Chat',
      msgCount: 2,
      modelRef: {
        accountId: 'acct-1',
        modelId: 'model-1'
      },
      workspacePath: '/tmp/workspace',
      userInstruction: 'be concise',
      permissionApprovalMode: 'auto',
      createTime: 100,
      updateTime: 200,
      messages: []
    })).toEqual({
      id: 0,
      uuid: 'chat-1',
      title: 'Test Chat',
      msg_count: 2,
      model_account_id: 'acct-1',
      model_model_id: 'model-1',
      workspace_path: '/tmp/workspace',
      user_instruction: 'be concise',
      permission_approval_mode: 'auto',
      create_time: 100,
      update_time: 200
    })
  })

  it('maps a chat row into a chat entity', () => {
    expect(toChatEntity({
      id: 3,
      uuid: 'chat-1',
      title: 'Test Chat',
      msg_count: 2,
      model_account_id: 'acct-1',
      model_model_id: 'model-1',
      workspace_path: '/tmp/workspace',
      user_instruction: 'be concise',
      permission_approval_mode: 'auto',
      create_time: 100,
      update_time: 200
    })).toEqual({
      id: 3,
      uuid: 'chat-1',
      title: 'Test Chat',
      msgCount: 2,
      modelRef: {
        accountId: 'acct-1',
        modelId: 'model-1'
      },
      workspacePath: '/tmp/workspace',
      userInstruction: 'be concise',
      permissionApprovalMode: 'auto',
      createTime: 100,
      updateTime: 200,
      messages: []
    })
  })

  it('defaults missing permission approval mode to manual', () => {
    expect(toChatEntity({
      id: 4,
      uuid: 'chat-2',
      title: 'Legacy Chat',
      msg_count: 0,
      model_account_id: null,
      model_model_id: null,
      workspace_path: null,
      user_instruction: null,
      permission_approval_mode: null,
      create_time: 300,
      update_time: 400
    })).toEqual({
      id: 4,
      uuid: 'chat-2',
      title: 'Legacy Chat',
      msgCount: 0,
      modelRef: undefined,
      workspacePath: undefined,
      userInstruction: undefined,
      permissionApprovalMode: 'manual',
      createTime: 300,
      updateTime: 400,
      messages: []
    })
  })
})
