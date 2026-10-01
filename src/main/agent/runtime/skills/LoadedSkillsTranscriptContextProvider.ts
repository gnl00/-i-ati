import type { ContextUserRecord } from '../context/ContextRecord'

export interface LoadedSkillsTranscriptContextProviderInput {
  recordId: string
  timestamp: number
}

export interface LoadedSkillsTranscriptContextProvider {
  build(input: LoadedSkillsTranscriptContextProviderInput): Promise<ContextUserRecord | null>
}
