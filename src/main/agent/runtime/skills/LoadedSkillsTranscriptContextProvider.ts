import type { AgentTranscriptUserRecord } from '../transcript/AgentTranscriptRecord'

export interface LoadedSkillsTranscriptContextProviderInput {
  recordId: string
  timestamp: number
}

export interface LoadedSkillsTranscriptContextProvider {
  build(input: LoadedSkillsTranscriptContextProviderInput): Promise<AgentTranscriptUserRecord | null>
}

