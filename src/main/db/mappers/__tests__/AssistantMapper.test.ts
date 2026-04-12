import { describe, expect, it } from 'vitest'
import {
  toAssistantEntity,
  toAssistantRow
} from '../AssistantMapper'

describe('AssistantMapper', () => {
  it('maps an assistant into a row', () => {
    const assistant: Assistant = {
      id: 'assistant-1',
      name: 'CodeHelper',
      description: 'Writes code',
      modelRef: {
        accountId: 'account-1',
        modelId: 'model-1'
      },
      systemPrompt: 'help',
      sortIndex: 2,
      createdAt: 100,
      updatedAt: 200,
      isBuiltIn: true,
      isDefault: false
    }

    expect(toAssistantRow(assistant)).toEqual({
      id: 'assistant-1',
      name: 'CodeHelper',
      description: 'Writes code',
      model_account_id: 'account-1',
      model_model_id: 'model-1',
      system_prompt: 'help',
      sort_index: 2,
      created_at: 100,
      updated_at: 200,
      is_built_in: 1,
      is_default: 0
    })
  })

  it('maps a row back into an assistant', () => {
    expect(toAssistantEntity({
      id: 'assistant-1',
      name: 'CodeHelper',
      description: 'Writes code',
      model_account_id: 'account-1',
      model_model_id: 'model-1',
      system_prompt: 'help',
      sort_index: 2,
      created_at: 100,
      updated_at: 200,
      is_built_in: 1,
      is_default: 0
    })).toEqual({
      id: 'assistant-1',
      name: 'CodeHelper',
      description: 'Writes code',
      modelRef: {
        accountId: 'account-1',
        modelId: 'model-1'
      },
      systemPrompt: 'help',
      sortIndex: 2,
      createdAt: 100,
      updatedAt: 200,
      isBuiltIn: true,
      isDefault: false
    })
  })
})
