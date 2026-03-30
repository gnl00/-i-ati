import type { StepArtifact } from '../types'
import type { AssistantCycleSnapshot } from './AssistantCycleBuffer'

export interface AgentStepCommitter {
  beginCycle(): void
  updateStreamPreview(snapshot: AssistantCycleSnapshot): void
  clearStreamPreview(): void
  commitToolOnlyCycle(snapshot: AssistantCycleSnapshot): void
  commitFinalCycle(snapshot: AssistantCycleSnapshot): void
  setLastUsage(usage: ITokenUsage): void
  getLastUsage(): ITokenUsage | undefined
  commitToolResult(message: ChatMessage): Promise<void>
  getFinalAssistantMessage(): MessageEntity
  getArtifacts(): StepArtifact[]
}
