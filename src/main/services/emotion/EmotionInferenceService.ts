import { pipeline, env } from '@xenova/transformers'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { buildFallbackEmotionState } from './emotion-state'

env.allowLocalModels = true
env.allowRemoteModels = false

type TextClassificationResult = {
  label: string
  score: number
}

const DEFAULT_MAX_INPUT_TOKENS = 512
const SUSPICIOUS_TOKENIZER_LIMIT = 100_000

export class EmotionInferenceService {
  private static instance: EmotionInferenceService
  private classifier: any = null
  private readonly modelPath: string
  private readonly MODEL_NAME = 'bert-emotion'
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null

  private constructor() {
    this.modelPath = app.isPackaged
      ? path.join(process.resourcesPath, 'models')
      : path.join(process.cwd(), 'resources', 'models')
  }

  public static getInstance(): EmotionInferenceService {
    if (!EmotionInferenceService.instance) {
      EmotionInferenceService.instance = new EmotionInferenceService()
    }
    return EmotionInferenceService.instance
  }

  public async infer(text: string): Promise<ChatEmotionState | null> {
    const input = text.trim()
    if (!input) {
      return null
    }

    await this.initialize()

    try {
      const result = await this.classifier(input, { top_k: 1 })
      const top = Array.isArray(result)
        ? result[0] as TextClassificationResult | undefined
        : result as TextClassificationResult | undefined
      const label = top?.label?.trim()

      if (!label) {
        return null
      }

      return buildFallbackEmotionState(label, Number(top?.score) || 0)
    } catch (error) {
      console.warn('[EmotionInferenceService] Failed to infer emotion', error)
      return null
    }
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this.initializationPromise = this._initialize()

    try {
      await this.initializationPromise
    } finally {
      this.initializationPromise = null
    }
  }

  private async _initialize(): Promise<void> {
    env.localModelPath = this.modelPath

    const modelDirectory = path.join(this.modelPath, this.MODEL_NAME)
    if (!fs.existsSync(modelDirectory)) {
      throw new Error(`Emotion model directory not found: ${modelDirectory}`)
    }

    this.classifier = await pipeline(
      'text-classification',
      this.MODEL_NAME,
      { quantized: false }
    )
    this.configureTokenizerLimit()

    this.isInitialized = true
  }

  private configureTokenizerLimit(): void {
    const tokenizer = this.classifier?.tokenizer
    if (!tokenizer) {
      return
    }

    const modelLimit = Number(this.classifier?.model?.config?.max_position_embeddings)
    const tokenizerLimit = Number(tokenizer.model_max_length)
    const resolvedLimit = this.resolveMaxInputTokens(modelLimit, tokenizerLimit)

    tokenizer.model_max_length = resolvedLimit
  }

  private resolveMaxInputTokens(modelLimit: number, tokenizerLimit: number): number {
    if (Number.isFinite(modelLimit) && modelLimit > 0) {
      return modelLimit
    }

    if (
      Number.isFinite(tokenizerLimit)
      && tokenizerLimit > 0
      && tokenizerLimit <= SUSPICIOUS_TOKENIZER_LIMIT
    ) {
      return tokenizerLimit
    }

    return DEFAULT_MAX_INPUT_TOKENS
  }
}

export default EmotionInferenceService.getInstance()
