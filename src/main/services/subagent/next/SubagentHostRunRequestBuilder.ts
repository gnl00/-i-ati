import type { HostRunRequest } from '@main/services/next/host/bootstrap/HostRunRequest'
import type { SubagentSpawnInput } from '../types'

export interface SubagentHostRunRequestBuilder {
  build(input: SubagentSpawnInput, userMessage: string, submittedAt: number): HostRunRequest
}

export class DefaultSubagentHostRunRequestBuilder implements SubagentHostRunRequestBuilder {
  build(input: SubagentSpawnInput, userMessage: string, submittedAt: number): HostRunRequest {
    return {
      hostType: 'subagent',
      hostRequestId: input.subagentId || `subagent-${submittedAt}`,
      submittedAt,
      userContent: [
        {
          type: 'input_text',
          text: userMessage
        }
      ],
      metadata: {
        subagentId: input.subagentId,
        role: input.role,
        contextMode: input.contextMode,
        files: input.files,
        chatUuid: input.chatUuid,
        modelRef: input.modelRef
      }
    }
  }
}
