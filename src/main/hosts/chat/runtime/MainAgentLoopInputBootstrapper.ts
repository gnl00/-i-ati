import type { LoopInputBootstrapper, LoopInputBootstrapperInput } from '@main/agent/runtime/host/bootstrap/LoopInputBootstrapper'
import type { AgentLoopInput } from '@main/agent/runtime/loop/AgentLoopInput'
import type { AgentContentPart } from '@main/agent/runtime/transcript/AgentContentPart'
import type {
  AgentTranscriptAssistantStepRecord,
  AgentTranscriptRecord,
  AgentTranscriptToolResultRecord,
  AgentTranscriptUserRecord
} from '@main/agent/runtime/transcript/AgentTranscriptRecord'

const partsFromUserContent = (content: string | VLMContent[]): AgentContentPart[] => {
  if (typeof content === 'string') {
    return [{
      type: 'input_text',
      text: content
    }]
  }

  const parts: AgentContentPart[] = []
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({
        type: 'input_text',
        text: part.text || ''
      })
      continue
    }

    parts.push({
      type: 'input_image',
      imageUrl: part.image_url?.url,
      detail: part.image_url?.detail ?? 'auto'
    })
  }
  return parts
}

const stringifyAssistantContent = (content: string | VLMContent[]): string => {
  if (typeof content === 'string') {
    return content
  }

  return content
    .filter(part => part.type === 'text')
    .map(part => part.text || '')
    .join('')
}

const stringifyToolContent = (content: string | VLMContent[]): string => {
  if (typeof content === 'string') {
    return content
  }

  try {
    return JSON.stringify(content)
  } catch {
    return content
      .filter(part => part.type === 'text')
      .map(part => part.text || '')
      .join('')
  }
}

const extractReasoning = (message: ChatMessage): string | undefined => {
  const segments = message.segments || []
  const reasoning = segments
    .filter((segment): segment is ReasoningSegment => segment.type === 'reasoning')
    .map(segment => segment.content)
    .join('')

  return reasoning || undefined
}

type HostRequestMetadata = {
  initialMessages?: ChatMessage[]
}

export class MainAgentLoopInputBootstrapper implements LoopInputBootstrapper {
  bootstrap(input: LoopInputBootstrapperInput): AgentLoopInput {
    const now = input.runtimeInfrastructure.runtimeClock.now()
    const metadata = (input.hostRequest.metadata || {}) as HostRequestMetadata
    const initialMessages = metadata.initialMessages || []
    const transcriptId = input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptId()
    const records: AgentTranscriptRecord[] = []

    let assistantStepIndex = 0
    let currentAssistantStepId: string | undefined

    for (const message of initialMessages) {
      const timestamp = message.createdAt ?? now

      if (message.role === 'user') {
        const record: AgentTranscriptUserRecord = {
          recordId: input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId(),
          kind: 'user',
          timestamp,
          content: partsFromUserContent(message.content)
        }
        records.push(record)
        continue
      }

      if (message.role === 'assistant') {
        const stepId = input.runtimeInfrastructure.loopIdentityProvider.nextStepId()
        currentAssistantStepId = stepId
        const record: AgentTranscriptAssistantStepRecord = {
          recordId: input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId(),
          kind: 'assistant_step',
          timestamp,
          step: {
            status: 'completed',
            stepId,
            stepIndex: assistantStepIndex,
            startedAt: timestamp,
            completedAt: timestamp,
            model: message.model,
            content: stringifyAssistantContent(message.content),
            reasoning: extractReasoning(message),
            toolCalls: [...(message.toolCalls || [])],
            finishReason: undefined,
            usage: undefined
          }
        }
        records.push(record)
        assistantStepIndex += 1
        continue
      }

      const matchedToolCall = currentAssistantStepId
        ? records
            .slice()
            .reverse()
            .find((record): record is AgentTranscriptAssistantStepRecord => (
              record.kind === 'assistant_step' && record.step.stepId === currentAssistantStepId
            ))
            ?.step.toolCalls.find(toolCall => toolCall.id === message.toolCallId)
        : undefined

      const toolRecord: AgentTranscriptToolResultRecord = {
        recordId: input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId(),
        kind: 'tool_result',
        timestamp,
        stepId: currentAssistantStepId || input.runtimeInfrastructure.loopIdentityProvider.nextStepId(),
        toolCallId: message.toolCallId || input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId(),
        toolCallIndex: matchedToolCall?.index ?? 0,
        toolName: message.name || matchedToolCall?.function.name || 'tool',
        status: 'success',
        content: stringifyToolContent(message.content)
      }
      records.push(toolRecord)
    }

    const transcript = input.initialTranscriptMaterializer.materialize({
      transcriptId,
      createdAt: records[0]?.timestamp ?? now,
      updatedAt: records[records.length - 1]?.timestamp ?? now,
      records: records.length > 0
        ? records
        : [
            input.userRecordMaterializer.materialize({
              recordId: input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId(),
              timestamp: now,
              content: input.hostRequest.userContent
            })
          ]
    })

    return {
      run: input.run,
      transcript,
      requestSpec: input.requestSpec,
      execution: input.execution
    }
  }
}
