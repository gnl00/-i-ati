import type { IndexStrategy, IndexStrategyInput } from './types'
import {
  buildBaseMetadata,
  normalizeCommonText,
  splitIntoChunks,
  stripMarkup
} from './shared'

export class HTMLIndexStrategy implements IndexStrategy {
  readonly name = 'html'

  supports(input: IndexStrategyInput['file']): boolean {
    return input.ext === '.html' || input.ext === '.xml'
  }

  prepare(input: IndexStrategyInput) {
    const normalizedText = normalizeCommonText(stripMarkup(input.rawText))

    return {
      strategyName: this.name,
      normalizedText,
      chunks: splitIntoChunks(normalizedText, input.chunkSize, input.chunkOverlap),
      sharedMetadata: buildBaseMetadata(input.file, this.name)
    }
  }
}
