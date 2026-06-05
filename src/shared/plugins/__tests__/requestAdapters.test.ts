import { describe, expect, it } from 'vitest'
import {
  getBuiltInRequestAdapterOptions,
  getRequestAdapterOptionsFromPlugins
} from '../requestAdapters'

describe('requestAdapters', () => {
  it('lists fresh built-in request adapters', () => {
    expect(getBuiltInRequestAdapterOptions().map(option => option.pluginId)).toEqual([
      'openai-chat-compatible-adapter',
      'openai-image-compatible-adapter',
      'claude-compatible-adapter',
      'openai-responses-compatible-adapter',
      'google-gemini-compatible-adapter'
    ])
  })

  it('lists built-in request adapters from loaded plugin entities', () => {
    const options = getRequestAdapterOptionsFromPlugins([
      {
        pluginId: 'google-gemini-compatible-adapter',
        name: 'Google Gemini Compatible Adapter',
        source: 'built-in',
        enabled: true,
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'gemini',
            modelTypes: ['llm', 'vlm']
          }
        }]
      },
      {
        pluginId: 'custom-request-adapter',
        name: 'Custom Request Adapter',
        source: 'remote',
        enabled: true,
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'gemini',
            modelTypes: ['llm', 'vlm']
          }
        }]
      }
    ])

    expect(options.map(option => option.pluginId)).toEqual(['google-gemini-compatible-adapter'])
  })
})
