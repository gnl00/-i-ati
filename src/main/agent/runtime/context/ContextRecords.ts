import type { AgentContentPart } from './ContextContentPart'
import type { AgentStep } from '../step/AgentStep'
import type { ToolResultFact } from '../tools/ToolResultFact'
import type {
  ContextAssistantRecord,
  ContextToolResultRecord,
  ContextUserRecord
} from './ContextRecord'

export const createUserContextRecord = (input: {
  recordId: string
  timestamp: number
  content: AgentContentPart[]
}): ContextUserRecord => ({
  ...input,
  kind: 'user',
  content: [...input.content]
})

export const createAssistantContextRecord = (input: {
  recordId: string
  timestamp: number
  step: AgentStep
}): ContextAssistantRecord => ({
  ...input,
  kind: 'assistant_step'
})

export const createToolContextRecord = (input: {
  recordId: string
  timestamp: number
  result: ToolResultFact
}): ContextToolResultRecord => ({
  ...input.result,
  recordId: input.recordId,
  timestamp: input.timestamp,
  kind: 'tool_result'
})
