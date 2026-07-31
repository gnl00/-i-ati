import type { AgentSteeringMessage } from '../steering/SteeringMessageSource'

export interface SteeringConsumedEvent {
  type: 'steering.consumed'
  timestamp: number
  message: AgentSteeringMessage
}

export type SteeringEvent = SteeringConsumedEvent
