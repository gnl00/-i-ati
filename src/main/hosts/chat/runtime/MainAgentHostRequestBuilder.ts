import {
  type AgentContentPart,
  type HostRunRequest
} from '@main/agent/contracts/HostRuntimeContracts'
import type { MainAgentRunInput, RunPreparationResult } from '../preparation'

type HostRunRequestMetadata = {
  contextMessages: ChatMessage[]
}

export const toAgentContentParts = (
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

  return [
    {
      type: 'input_text',
      text
    }
  ]
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
        contextMessages: prepared.runSpec.contextMessages
      } satisfies HostRunRequestMetadata
    }
  }
}
