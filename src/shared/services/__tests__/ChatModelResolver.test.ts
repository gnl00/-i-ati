import { describe, expect, it } from 'vitest'
import {
  isModelRefAvailable,
  resolveExistingChatModelRef,
  resolveFirstAvailableModelRef,
  resolveHistoryChatModelRef,
  resolveNewChatModelRef,
  resolveStoredChatModelRef
} from '../ChatModelResolver'

describe('ChatModelResolver', () => {
  const buildConfig = (): IAppConfig => ({
    providerDefinitions: [],
    accounts: [
      {
        id: 'account-1',
        providerId: 'provider-1',
        label: 'Account 1',
        apiUrl: 'https://example.com',
        apiKey: 'key',
        models: [
          { id: 'model-a', label: 'Model A', type: 'llm', enabled: true },
          { id: 'model-b', label: 'Model B', type: 'mllm', enabled: false }
        ]
      },
      {
        id: 'account-2',
        providerId: 'provider-2',
        label: 'Account 2',
        apiUrl: 'https://example.com',
        apiKey: 'key',
        models: [
          { id: 'model-c', label: 'Model C', type: 'mllm', enabled: true }
        ]
      }
    ],
    tools: {
      defaultModel: {
        accountId: 'account-2',
        modelId: 'model-c'
      }
    }
  })

  it('accepts only enabled model refs', () => {
    const config = buildConfig()

    expect(isModelRefAvailable(config, { accountId: 'account-1', modelId: 'model-a' })).toBe(true)
    expect(isModelRefAvailable(config, { accountId: 'account-1', modelId: 'model-b' })).toBe(false)
    expect(isModelRefAvailable(config, { accountId: 'missing', modelId: 'model-a' })).toBe(false)
  })

  it('resolves the first enabled model as a fallback', () => {
    const config = buildConfig()

    expect(resolveFirstAvailableModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
  })

  it('uses the configured default model for new chats when valid', () => {
    const config = buildConfig()

    expect(resolveNewChatModelRef(config)).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
  })

  it('falls back to the first enabled model when the configured default is invalid', () => {
    const config = {
      ...buildConfig(),
      tools: {
        defaultModel: {
          accountId: 'account-1',
          modelId: 'model-b'
        }
      }
    } satisfies IAppConfig

    expect(resolveNewChatModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
  })

  it('prefers the chat stored modelRef over the default model', () => {
    const config = buildConfig()

    expect(resolveStoredChatModelRef(config, {
      modelRef: { accountId: 'account-1', modelId: 'model-a' }
    })).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
    expect(resolveExistingChatModelRef(config, {
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      modelRef: { accountId: 'account-1', modelId: 'model-a' },
      createTime: 1,
      updateTime: 1
    })).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
  })

  it('falls back to the last assistant modelRef when chat.modelRef is unavailable', () => {
    const config = buildConfig()
    const messages: MessageEntity[] = [
      {
        id: 1,
        body: {
          role: 'assistant',
          content: 'hello',
          segments: [],
          modelRef: {
            accountId: 'account-1',
            modelId: 'model-a'
          }
        }
      }
    ]

    expect(resolveHistoryChatModelRef(config, messages)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
    expect(resolveExistingChatModelRef(config, {
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    }, messages)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
  })

  it('falls back to the new-chat model when chat.modelRef and history modelRef are unavailable', () => {
    const config = buildConfig()
    const messages: MessageEntity[] = [
      {
        id: 1,
        body: {
          role: 'assistant',
          content: 'hello',
          segments: [],
          modelRef: {
            accountId: 'account-1',
            modelId: 'model-b'
          }
        }
      }
    ]

    expect(resolveExistingChatModelRef(config, {
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      modelRef: {
        accountId: 'missing-account',
        modelId: 'missing-model'
      },
      createTime: 1,
      updateTime: 1
    }, messages)).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
  })
})
