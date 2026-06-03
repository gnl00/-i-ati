import { describe, expect, it } from 'vitest'
import {
  getEffectiveThinkingLevel,
  getRequestAdapterThinkingCapability,
  modelHasReasoningCapability,
  modelSupportsThinking,
  normalizeThinkingCapability
} from '../requestAdapterThinking'

describe('requestAdapterThinking', () => {
  it('uses installed OpenAI chat-compatible thinking levels', () => {
    const capability = getRequestAdapterThinkingCapability({
      plugins: [{
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        source: 'built-in',
        enabled: true,
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['llm', 'vlm'],
            thinking: {
              levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
              defaultLevel: 'medium'
            }
          }
        }]
      }],
      pluginId: 'openai-chat-compatible-adapter'
    })

    expect(capability).toEqual({
      levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      defaultLevel: 'medium'
    })
    expect(modelSupportsThinking({
      id: 'gpt-5',
      label: 'GPT-5',
      type: 'llm',
      capabilities: ['reasoning']
    }, capability)).toBe(true)
    expect(modelSupportsThinking({ id: 'gpt-4o', label: 'GPT-4o', type: 'llm' }, capability)).toBe(false)
    expect(getEffectiveThinkingLevel({
      id: 'gpt-5',
      label: 'GPT-5',
      type: 'llm',
      capabilities: ['reasoning']
    }, capability, undefined)).toBe('medium')
    expect(getEffectiveThinkingLevel({
      id: 'gpt-5',
      label: 'GPT-5',
      type: 'llm',
      capabilities: ['reasoning']
    }, capability, 'high')).toBe('high')
    expect(getEffectiveThinkingLevel({
      id: 'gpt-4o',
      label: 'GPT-4o',
      type: 'llm'
    }, capability, 'high')).toBeUndefined()
  })

  it('uses manifest-declared thinking levels when present', () => {
    const capability = getRequestAdapterThinkingCapability({
      plugins: [{
        pluginId: 'custom-reasoning-adapter',
        name: 'Custom Reasoning Adapter',
        source: 'local',
        enabled: true,
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'custom',
            modelTypes: ['llm'],
            thinking: {
              levels: ['minimal', 'low', 'high'],
              defaultLevel: 'low'
            }
          }
        }]
      }],
      pluginId: 'custom-reasoning-adapter'
    })

    expect(capability).toEqual({
      levels: ['minimal', 'low', 'high'],
      defaultLevel: 'low'
    })
  })

  it('uses DeepSeek OpenAI-compatible thinking levels when provider context matches DeepSeek', () => {
    const capability = getRequestAdapterThinkingCapability({
      plugins: [{
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        source: 'built-in',
        enabled: true,
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['llm', 'vlm'],
            thinking: {
              levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
              defaultLevel: 'medium'
            }
          }
        }]
      }],
      pluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.deepseek.com/v1',
      modelId: 'deepseek-v4-flash'
    })

    expect(capability).toEqual({
      levels: ['none', 'low', 'medium', 'high', 'max', 'xhigh'],
      defaultLevel: 'medium'
    })
  })

  it('normalizes invalid defaults to a valid level', () => {
    expect(normalizeThinkingCapability({
      levels: ['low', 'high'],
      defaultLevel: 'medium'
    })).toEqual({
      levels: ['low', 'high'],
      defaultLevel: 'low'
    })
  })

  it('detects reasoning capability from model capabilities or modalities', () => {
    expect(modelHasReasoningCapability({
      id: 'model-with-capability',
      label: 'Reasoning Model',
      type: 'llm',
      capabilities: ['reasoning']
    })).toBe(true)
    expect(modelHasReasoningCapability({
      id: 'model-with-modality',
      label: 'Reason Model',
      type: 'llm',
      modalities: ['text', 'reason']
    })).toBe(true)
    expect(modelHasReasoningCapability({
      id: 'plain-model',
      label: 'Plain Model',
      type: 'llm',
      modalities: ['text']
    })).toBe(false)
  })
})
