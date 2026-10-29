import type { ToolResultFact } from '../tools/ToolResultFact'
import type { ContextUserRecord } from '../context/ContextRecord'

export interface LoadedSkillsTranscriptContextProviderInput {
  recordId: string
  timestamp: number
  results: readonly ToolResultFact[]
}

export interface LoadedSkillsTranscriptContextProvider {
  build(input: LoadedSkillsTranscriptContextProviderInput): Promise<ContextUserRecord | null>
}
