import { describe, expect, it } from 'vitest'
import {
  buildModelsDevCapabilityIndex,
  mapModelsDevModelToCapabilitySnapshot
} from '../capabilities'

describe('models.dev capability mapping', () => {
  it('maps model modalities and feature capabilities', () => {
    expect(mapModelsDevModelToCapabilitySnapshot({
      id: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      attachment: true,
      reasoning: true,
      tool_call: true,
      structured_output: true,
      temperature: true,
      knowledge: '2025-02-28',
      release_date: '2025-10-16',
      last_updated: '2025-10-16',
      limit: {
        context: 200000,
        output: 8192
      },
      modalities: {
        input: ['text', 'image', 'pdf'],
        output: ['text']
      },
      open_weights: false
    }, 'fallback-id', '2026-04-30')).toEqual({
      modelId: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      modalities: ['text', 'image', 'pdf', 'tool', 'reason'],
      capabilities: ['tool', 'reasoning', 'structured_output', 'temperature', 'attachment'],
      knowledge: '2025-02-28',
      releaseDate: '2025-10-16',
      lastUpdated: '2025-10-16',
      contextWindowTokens: 200000,
      sourceDate: '2026-04-30'
    })
  })

  it('uses interleaved reasoning as a reasoning signal', () => {
    expect(mapModelsDevModelToCapabilitySnapshot({
      id: 'glm-5v-turbo',
      reasoning: false,
      tool_call: false,
      interleaved: { field: 'reasoning_content' },
      modalities: {
        input: ['text', 'video', 'audio'],
        output: ['text']
      }
    }, 'fallback-id', '2026-04-30')?.modalities).toEqual([
      'text',
      'audio',
      'video',
      'reason'
    ])
  })

  it('indexes provider models by model id and merges duplicate capabilities', () => {
    const index = buildModelsDevCapabilityIndex({
      providerA: {
        models: {
          'same-model': {
            id: 'same-model',
            tool_call: true,
            last_updated: '2025-01-01',
            modalities: { input: ['text'], output: ['text'] }
          }
        }
      },
      providerB: {
        models: {
          'same-model': {
            id: 'same-model',
            reasoning: true,
            last_updated: '2025-02-01',
            modalities: { input: ['image'], output: ['text'] }
          }
        }
      }
    }, '2026-04-30')

    expect(index.get('same-model')).toEqual(expect.objectContaining({
      modalities: ['text', 'image', 'tool', 'reason'],
      capabilities: ['tool', 'reasoning'],
      lastUpdated: '2025-02-01'
    }))
  })
})
