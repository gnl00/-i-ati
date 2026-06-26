import type { LoopIdentityProvider } from '@main/agent/runtime/loop/LoopIdentityProvider'
import { projectToolResultContentForHistoryImport } from '@main/agent/runtime/tools/ToolResultContentProjector'
import type { AgentContentPart } from '@main/agent/runtime/transcript/AgentContentPart'
import type {
  AgentTranscriptAssistantStepRecord,
  AgentTranscriptRecord,
  AgentTranscriptToolResultRecord,
  AgentTranscriptUserRecord
} from '@main/agent/runtime/transcript/AgentTranscriptRecord'
import type { ChatInitialTranscriptSeed } from '@main/agent/contracts'

export interface ChatInitialTranscriptRecordFactoryInput {
  initialTranscriptSeed: ChatInitialTranscriptSeed[]
  now: number
  loopIdentityProvider: LoopIdentityProvider
}

export interface ChatInitialTranscriptRecordFactory {
  create(input: ChatInitialTranscriptRecordFactoryInput): AgentTranscriptRecord[]
}

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

export class DefaultChatInitialTranscriptRecordFactory implements ChatInitialTranscriptRecordFactory {
  create(input: ChatInitialTranscriptRecordFactoryInput): AgentTranscriptRecord[] {
    const records: AgentTranscriptRecord[] = []
    let assistantStepIndex = 0
    let currentAssistantStepId: string | undefined

    for (const seed of input.initialTranscriptSeed) {
      const timestamp = seed.timestamp ?? input.now

      if (seed.kind === 'user') {
        const record: AgentTranscriptUserRecord = {
          recordId: input.loopIdentityProvider.nextTranscriptRecordId(),
          kind: 'user',
          timestamp,
          source: seed.source,
          content: partsFromUserContent(seed.content)
        }
        records.push(record)
        continue
      }

      if (seed.kind === 'assistant') {
        const stepId = input.loopIdentityProvider.nextStepId()
        currentAssistantStepId = stepId
        const record: AgentTranscriptAssistantStepRecord = {
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
            reasoning: seed.reasoning,
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
            .find((record): record is AgentTranscriptAssistantStepRecord => (
              record.kind === 'assistant_step' && record.step.stepId === currentAssistantStepId
            ))
            ?.step.toolCalls.find(toolCall => toolCall.id === seed.toolCallId)
        : undefined

      const toolRecord: AgentTranscriptToolResultRecord = {
        recordId: input.loopIdentityProvider.nextTranscriptRecordId(),
        kind: 'tool_result',
        timestamp,
        stepId: currentAssistantStepId || input.loopIdentityProvider.nextStepId(),
        toolCallId: seed.toolCallId || input.loopIdentityProvider.nextTranscriptRecordId(),
        toolCallIndex: matchedToolCall?.index ?? 0,
        toolName: seed.toolName || matchedToolCall?.function.name || 'tool',
        status: 'success',
        content: projectToolResultContentForHistoryImport(seed.content)
      }
      records.push(toolRecord)
    }

    return records
  }
}
