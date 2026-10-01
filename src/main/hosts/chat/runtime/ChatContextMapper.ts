import {
  projectToolResultContentForHistoryImport,
  type AgentContentPart,
  type ContextAssistantRecord,
  type ContextRecord,
  type ContextToolResultRecord,
  type ContextUserRecord,
  type LoopIdentityProvider
} from '@main/agent/contracts/HostRuntimeContracts'

export interface ChatContextMapperInput {
  messages: ChatMessage[]
  now: number
  loopIdentityProvider: LoopIdentityProvider
}

const partsFromUserContent = (content: string | VLMContent[]): AgentContentPart[] => {
  if (typeof content === 'string') {
    return [
      {
        type: 'input_text',
        text: content
      }
    ]
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
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('')
}

export const mapChatContext = (input: ChatContextMapperInput): ContextRecord[] => {
  const records: ContextRecord[] = []
  let assistantStepIndex = 0
  let currentAssistantStepId: string | undefined

  for (const seed of input.messages) {
    const timestamp = seed.createdAt ?? input.now

    if (seed.role === 'user') {
      const record: ContextUserRecord = {
        recordId: input.loopIdentityProvider.nextTranscriptRecordId(),
        kind: 'user',
        timestamp,
        source: seed.source,
        content: partsFromUserContent(seed.content)
      }
      records.push(record)
      continue
    }

    if (seed.role === 'assistant') {
      const stepId = input.loopIdentityProvider.nextStepId()
      currentAssistantStepId = stepId
      const record: ContextAssistantRecord = {
        recordId: input.loopIdentityProvider.nextTranscriptRecordId(),
        kind: 'assistant_step',
        timestamp,
        step: {
          status: 'completed',
          stepId,
          stepIndex: assistantStepIndex,
          startedAt: timestamp,
          completedAt: timestamp,
          model: seed.model,
          content: stringifyAssistantContent(seed.content),
          reasoning:
            seed.segments
              ?.filter((segment) => segment.type === 'reasoning')
              .map((segment) => segment.content)
              .join('') || undefined,
          toolCalls: [...(seed.toolCalls || [])],
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
          .find(
            (record): record is ContextAssistantRecord =>
              record.kind === 'assistant_step' && record.step.stepId === currentAssistantStepId
          )
          ?.step.toolCalls.find((toolCall) => toolCall.id === seed.toolCallId)
      : undefined

    const toolRecord: ContextToolResultRecord = {
      recordId: input.loopIdentityProvider.nextTranscriptRecordId(),
      kind: 'tool_result',
      timestamp,
      stepId: currentAssistantStepId || input.loopIdentityProvider.nextStepId(),
      toolCallId: seed.toolCallId || input.loopIdentityProvider.nextTranscriptRecordId(),
      toolCallIndex: matchedToolCall?.index ?? 0,
      toolName: seed.name || matchedToolCall?.function.name || 'tool',
      status: 'success',
      content: projectToolResultContentForHistoryImport(seed.content),
      modelContent: seed.toolResultModelContent
    }
    records.push(toolRecord)
  }

  return records
}
