import type { AgentContentPart } from '../transcript/AgentContentPart'

export interface AgentSteeringMessage {
  queueItemId: string
  text: string
  imageUrls: string[]
  content: AgentContentPart[]
}

export interface AgentSteeringContext {
  source: string
  content: AgentContentPart[]
}

export interface SteeringMessageSource {
  take(): AgentSteeringMessage | undefined
  resolveContext?(
    message: AgentSteeringMessage
  ): AgentSteeringContext | undefined | Promise<AgentSteeringContext | undefined>
  acknowledge(queueItemId: string): void
}
