import type { AgentContentPart } from '../transcript/AgentContentPart'

export interface AgentSteeringMessage {
  queueItemId: string
  text: string
  imageUrls: string[]
  content: AgentContentPart[]
}

export interface SteeringMessageSource {
  take(): AgentSteeringMessage | undefined
  acknowledge(queueItemId: string): void
}
