import type { IndexStrategy, IndexStrategyInput } from './types'
import {
  buildBaseMetadata,
  normalizeCommonText,
  splitIntoChunks
} from './shared'

export class DefaultIndexStrategy implements IndexStrategy {
  readonly name = 'default'

  supports(): boolean {
    return true
  }

  prepare(input: IndexStrategyInput) {
    const normalizedText = normalizeCommonText(input.rawText)

    return {
      strategyName: this.name,
      normalizedText,
      chunks: splitIntoChunks(normalizedText, input.chunkSize, input.chunkOverlap),
      sharedMetadata: buildBaseMetadata(input.file, this.name)
    }
  }
}
