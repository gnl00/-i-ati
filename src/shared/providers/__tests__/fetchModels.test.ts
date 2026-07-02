import { describe, expect, it } from 'vitest'
import {
  inferFetchedModelType,
  mapApiModelsResponseToAccountModels,
  normalizeModelsEndpoint
} from '../fetchModels'

describe('fetchModels shared helpers', () => {
  it('normalizes provider API base URLs to models endpoints', () => {
    expect(normalizeModelsEndpoint(' https://ark.example.com/api/v3/// ')).toBe('https://ark.example.com/api/v3/models')
    expect(normalizeModelsEndpoint('https://ark.example.com/api/v3/models')).toBe('https://ark.example.com/api/v3/models')
    expect(normalizeModelsEndpoint('https://ark.example.com/api/v3/models/')).toBe('https://ark.example.com/api/v3/models')
  })

  it('maps API response data into account models', () => {
    expect(mapApiModelsResponseToAccountModels({
      object: 'list',
      data: [
        { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' },
        { id: 'vision-model', object: 'model', owned_by: 'provider' },
        { id: 'text-model', object: 'model', owned_by: 'provider' }
      ]
    })).toEqual([
      {
        id: 'gpt-4o-mini',
        label: 'gpt-4o-mini',
        type: 'mllm',
        enabled: true
      },
      {
        id: 'vision-model',
        label: 'vision-model',
        type: 'vlm',
        enabled: true
      },
      {
        id: 'text-model',
        label: 'text-model',
        type: 'llm',
        enabled: true
      }
    ])
  })

  it('rejects malformed API responses', () => {
    expect(() => mapApiModelsResponseToAccountModels({ object: 'list' })).toThrow('data must be an array')
  })

  it('infers image generation models', () => {
    expect(inferFetchedModelType('dall-e-3')).toBe('img_gen')
  })
})
