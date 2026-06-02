import type { HostRunRequest } from '@main/agent/runtime/host/bootstrap/HostRunRequest'
import type { AgentContentPart } from '@main/agent/runtime/transcript/AgentContentPart'
import type { MainAgentRunInput, RunPreparationResult } from '../preparation'
import type { ChatInitialTranscriptSeed } from './ChatInitialTranscriptSeed'

type HostRunRequestMetadata = {
  initialTranscriptSeed: ChatInitialTranscriptSeed[]
}

const extractReasoning = (message: ChatMessage): string | undefined => {
  const reasoning = (message.segments || [])
    .filter((segment): segment is ReasoningSegment => segment.type === 'reasoning')
    .map(segment => segment.content)
    .join('')

  return reasoning || undefined
}

const toInitialTranscriptSeed = (messages: ChatMessage[]): ChatInitialTranscriptSeed[] => (
  messages.map((message): ChatInitialTranscriptSeed => {
    const timestamp = message.createdAt

    if (message.role === 'user') {
      return {
        kind: 'user',
        timestamp,
        content: message.content
      }
    }

    if (message.role === 'assistant') {
      return {
        kind: 'assistant',
        timestamp,
        model: message.model,
        content: message.content,
        reasoning: extractReasoning(message),
        toolCalls: message.toolCalls ? [...message.toolCalls] : undefined
      }
    }

    return {
      kind: 'tool',
      timestamp,
      toolCallId: message.toolCallId,
      toolName: message.name,
      content: message.content
    }
  })
)

const toAgentContentParts = (
  modelType: string | undefined,
  textCtx: string,
  mediaCtx: ClipbordImg[] | string[]
): AgentContentPart[] => {
  const text = textCtx.trim()

  if (modelType === 'vlm' || modelType === 'mllm') {
    const parts: AgentContentPart[] = []
    for (const media of mediaCtx) {
      if (!media) continue
      parts.push({
        type: 'input_image',
        imageUrl: String(media),
        detail: 'auto'
      })
    }
    if (text) {
      parts.push({
        type: 'input_text',
        text
      })
    }
    return parts
  }

  return [{
    type: 'input_text',
    text
  }]
}

export interface MainAgentHostRequestBuilder {
  build(input: {
    runInput: MainAgentRunInput
    prepared: RunPreparationResult
    submittedAt: number
  }): HostRunRequest
}

export class DefaultMainAgentHostRequestBuilder implements MainAgentHostRequestBuilder {
  build(input: {
    runInput: MainAgentRunInput
    prepared: RunPreparationResult
    submittedAt: number
  }): HostRunRequest {
    const { runInput, prepared, submittedAt } = input

    return {
      hostType: 'main-agent',
      hostRequestId: runInput.submissionId,
      submittedAt,
      userContent: toAgentContentParts(
        prepared.runSpec.modelContext.model.type,
        runInput.input.textCtx,
        runInput.input.mediaCtx
      ),
      metadata: {
        initialTranscriptSeed: toInitialTranscriptSeed(prepared.runSpec.initialMessages)
      } satisfies HostRunRequestMetadata
    }
  }
}
