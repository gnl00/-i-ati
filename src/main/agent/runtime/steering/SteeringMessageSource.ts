import type { AgentContentPart } from '../context/ContextContentPart'

export interface AgentSteeringMessage {
  queueItemId: string
  text: string
  textAttachments?: TextAttachment[]
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
