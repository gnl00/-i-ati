import type { HostRunRequest } from '@main/services/next/host/bootstrap/HostRunRequest'
import type { AgentContentPart } from '@main/services/next/transcript/AgentContentPart'
import type { MainChatRunInput, RunPreparationResult } from '../preparation'

type HostRunRequestMetadata = {
  initialMessages: ChatMessage[]
}

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
    runInput: MainChatRunInput
    prepared: RunPreparationResult
    submittedAt: number
  }): HostRunRequest
}

export class DefaultMainAgentHostRequestBuilder implements MainAgentHostRequestBuilder {
  build(input: {
    runInput: MainChatRunInput
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
        initialMessages: prepared.runSpec.request.messages
      } satisfies HostRunRequestMetadata
    }
  }
}

