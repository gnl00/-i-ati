import { describe, expect, it } from 'vitest'
import {
  isVisionModel,
  isImageGenModel,
  isImageGenModelRefAvailable,
  isModelRefAvailable,
  isVisionModelRefAvailable,
  resolveExistingChatModelRef,
  resolveFirstAvailableModelRef,
  resolveFirstAvailableVisionModelRef,
  resolveHistoryChatModelRef,
  resolveLiteModelRef,
  resolveMainModelRef,
  resolveNewChatModelRef,
  resolveStoredChatModelRef,
  resolveVisionModelRef
} from '../ChatModelResolver'

describe('ChatModelResolver', () => {
  const buildConfig = (): IAppConfig => ({
    providerDefinitions: [
      {
        id: 'provider-1',
        displayName: 'Provider 1',
        adapterPluginId: 'openai-chat-compatible-adapter',
        enabled: true
      },
      {
        id: 'provider-2',
        displayName: 'Provider 2',
        adapterPluginId: 'openai-chat-compatible-adapter',
        enabled: true
      }
    ],
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
      mainModel: {
        accountId: 'account-2',
        modelId: 'model-c'
      },
      liteModel: {
        accountId: 'account-1',
        modelId: 'model-a'
      }
    }
  })

  it('accepts only enabled model refs', () => {
    const config = buildConfig()

    expect(isModelRefAvailable(config, { accountId: 'account-1', modelId: 'model-a' })).toBe(true)
    expect(isModelRefAvailable(config, { accountId: 'account-1', modelId: 'model-b' })).toBe(false)
    expect(isModelRefAvailable(config, { accountId: 'missing', modelId: 'model-a' })).toBe(false)
  })

  it('skips models from disabled providers', () => {
    const config = {
      ...buildConfig(),
      providerDefinitions: [
        {
          id: 'provider-1',
          displayName: 'Provider 1',
          adapterPluginId: 'openai-chat-compatible-adapter',
          enabled: false
        },
        {
          id: 'provider-2',
          displayName: 'Provider 2',
          adapterPluginId: 'openai-chat-compatible-adapter',
          enabled: true
        }
      ]
    } as unknown as IAppConfig

    expect(isModelRefAvailable(config, { accountId: 'account-1', modelId: 'model-a' })).toBe(false)
    expect(resolveFirstAvailableModelRef(config)).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
  })

  it('resolves the first enabled model as a fallback', () => {
    const config = buildConfig()

    expect(resolveFirstAvailableModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
  })

  it('uses the configured main model for new chats when valid', () => {
    const config = buildConfig()

    expect(resolveMainModelRef(config)).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
    expect(resolveNewChatModelRef(config)).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
  })

  it('falls back to the first enabled model when the configured main model is invalid', () => {
    const config = {
      ...buildConfig(),
      tools: {
        mainModel: {
          accountId: 'account-1',
          modelId: 'model-b'
        }
      }
    } as unknown as IAppConfig

    expect(resolveNewChatModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
  })

  it('resolves lite model before falling back to main model', () => {
    const config = buildConfig()

    expect(resolveLiteModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })

    expect(resolveLiteModelRef({
      ...config,
      tools: {
        mainModel: {
          accountId: 'account-2',
          modelId: 'model-c'
        }
      }
    })).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
  })

  it('resolves vision model from explicit slot or first vision-capable model', () => {
    const config = buildConfig()

    expect(resolveFirstAvailableVisionModelRef(config)).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
    expect(resolveVisionModelRef({
      ...config,
      tools: {
        ...config.tools,
        visionModel: {
          accountId: 'account-2',
          modelId: 'model-c'
        }
      }
    })).toEqual({
      accountId: 'account-2',
      modelId: 'model-c'
    })
    expect(isVisionModelRefAvailable(config, {
      accountId: 'account-1',
      modelId: 'model-a'
    })).toBe(false)
  })

  it('detects vision models from modalities and capabilities', () => {
    const config = {
      ...buildConfig(),
      accounts: [
        {
          id: 'account-1',
          providerId: 'provider-1',
          label: 'Account 1',
          apiUrl: 'https://example.com',
          apiKey: 'key',
          models: [
            {
              id: 'model-image-modality',
              label: 'Image Modality Model',
              type: 'llm',
              modalities: ['text', 'image'],
              enabled: true
            },
            {
              id: 'model-image-capability',
              label: 'Image Capability Model',
              type: 'llm',
              capabilities: ['image'],
              enabled: true
            }
          ]
        }
      ]
    } satisfies IAppConfig

    expect(isVisionModelRefAvailable(config, {
      accountId: 'account-1',
      modelId: 'model-image-modality'
    })).toBe(true)
    expect(isVisionModelRefAvailable(config, {
      accountId: 'account-1',
      modelId: 'model-image-capability'
    })).toBe(true)
    expect(resolveFirstAvailableVisionModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-image-modality'
    })
  })

  it('excludes image generation models from vision model resolution', () => {
    const config = {
      ...buildConfig(),
      accounts: [
        {
          id: 'account-1',
          providerId: 'provider-1',
          label: 'Account 1',
          apiUrl: 'https://example.com',
          apiKey: 'key',
          models: [
            {
              id: 'model-image-generator',
              label: 'Image Generator',
              type: 'img_gen',
              modalities: ['image'],
              capabilities: ['vision'],
              enabled: true
            },
            {
              id: 'model-vision',
              label: 'Vision Model',
              type: 'llm',
              modalities: ['text', 'image'],
              enabled: true
            }
          ]
        }
      ],
      tools: {
        visionModel: {
          accountId: 'account-1',
          modelId: 'model-image-generator'
        }
      }
    } satisfies IAppConfig

    expect(isVisionModel(config.accounts[0].models[0])).toBe(false)
    expect(isVisionModelRefAvailable(config, {
      accountId: 'account-1',
      modelId: 'model-image-generator'
    })).toBe(false)
    expect(resolveFirstAvailableVisionModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-vision'
    })
    expect(resolveVisionModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-vision'
    })
  })

  it('falls back to the main model when no vision model is available', () => {
    const config = {
      ...buildConfig(),
      accounts: [
        {
          id: 'account-1',
          providerId: 'provider-1',
          label: 'Account 1',
          apiUrl: 'https://example.com',
          apiKey: 'key',
          models: [
            { id: 'model-a', label: 'Model A', type: 'llm', enabled: true }
          ]
        }
      ],
      tools: {
        mainModel: {
          accountId: 'account-1',
          modelId: 'model-a'
        }
      }
    } satisfies IAppConfig

    expect(resolveVisionModelRef(config)).toEqual({
      accountId: 'account-1',
      modelId: 'model-a'
    })
  })

  it('prefers the chat stored modelRef over the main model', () => {
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


describe('image generation model selection', () => {
  it('accepts enabled img_gen models across adapters and plugin states', () => {
    const ref = { accountId: 'images', modelId: 'generate' }
    const model: AccountModel = { id: ref.modelId, label: 'Generate', type: 'img_gen' }
    const config: IAppConfig = {
      providerDefinitions: [{ id: 'provider', displayName: 'Provider', adapterPluginId: 'google-gemini-compatible-adapter' }],
      accounts: [{ id: ref.accountId, providerId: 'provider', label: 'Images', apiUrl: 'https://example.test', apiKey: '', models: [model] }],
      plugins: { items: [{ id: 'google-gemini-compatible-adapter', enabled: false }] as AppPluginConfig[] }
    }
    expect(isImageGenModel(model)).toBe(true)
    expect(isImageGenModelRefAvailable(config, ref)).toBe(true)
    model.enabled = false
    expect(isImageGenModel(model)).toBe(false)
    expect(isImageGenModelRefAvailable(config, ref)).toBe(false)
    model.enabled = true
    model.type = 'mllm'
    expect(isImageGenModel(model)).toBe(false)
    expect(isImageGenModelRefAvailable(config, ref)).toBe(false)
  })
})
