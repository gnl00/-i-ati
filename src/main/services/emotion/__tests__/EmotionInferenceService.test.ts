import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmotionInferenceService } from '../EmotionInferenceService'

const { mockExistsSync, mockPipeline } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockPipeline: vi.fn()
}))

vi.mock('@xenova/transformers', () => ({
  pipeline: mockPipeline,
  env: {
    allowLocalModels: true,
    allowRemoteModels: false,
    localModelPath: ''
  }
}))

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync
  },
  existsSync: mockExistsSync
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/mock/path')
  }
}))

describe('EmotionInferenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    ;(EmotionInferenceService as any).instance = undefined
  })

  afterEach(() => {
    ;(EmotionInferenceService as any).instance = undefined
  })

  it('aligns tokenizer max length to the model position limit', async () => {
    const classifier = vi.fn(async () => ({
      label: 'neutral',
      score: 0.9
    })) as any

    classifier.tokenizer = {
      model_max_length: 1000000000000000019884624838656
    }
    classifier.model = {
      config: {
        max_position_embeddings: 512
      }
    }

    mockPipeline.mockResolvedValue(classifier)

    const service = EmotionInferenceService.getInstance()
    await service.infer('A long response with markdown and code fences')

    expect(mockPipeline).toHaveBeenCalledWith(
      'text-classification',
      'bert-emotion',
      expect.objectContaining({
        quantized: false
      })
    )
    expect(classifier.tokenizer.model_max_length).toBe(512)
  })

  it('falls back to a reasonable tokenizer limit when model config omits one', async () => {
    const classifier = vi.fn(async () => ({
      label: 'neutral',
      score: 0.9
    })) as any

    classifier.tokenizer = {
      model_max_length: 256
    }
    classifier.model = {
      config: {}
    }

    mockPipeline.mockResolvedValue(classifier)

    const service = EmotionInferenceService.getInstance()
    await service.infer('Tokenizer limit should remain reasonable')

    expect(classifier.tokenizer.model_max_length).toBe(256)
  })

  it('falls back to the default limit when neither config provides a safe max length', async () => {
    const classifier = vi.fn(async () => ({
      label: 'neutral',
      score: 0.9
    })) as any

    classifier.tokenizer = {
      model_max_length: 1000000000000000019884624838656
    }
    classifier.model = {
      config: {}
    }

    mockPipeline.mockResolvedValue(classifier)

    const service = EmotionInferenceService.getInstance()
    await service.infer('Fallback to the default input token limit')

    expect(classifier.tokenizer.model_max_length).toBe(512)
  })
})
