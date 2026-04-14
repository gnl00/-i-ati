import { buildDifferentialSegmentPatches } from '@shared/run/messagePatch'
import type { MessageSegmentPatch } from '@shared/run/output-events'
import type { StepArtifact } from '@main/agent/contracts'

export type CommitAssistantMessageResult = {
  message: MessageEntity
  patches: MessageSegmentPatch[]
  artifact: StepArtifact
}

export class CommittedAssistantMessageController {
  private finalAssistantMessage: MessageEntity

  constructor(
    assistantPlaceholder: MessageEntity,
    private readonly messageEntities: MessageEntity[]
  ) {
    this.finalAssistantMessage = {
      ...assistantPlaceholder,
      body: {
        ...assistantPlaceholder.body
      }
    }
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.finalAssistantMessage
  }

  getCommittedTypewriterCompleted(): boolean {
    return Boolean(this.finalAssistantMessage.body.typewriterCompleted)
  }

  commit(body: ChatMessage): CommitAssistantMessageResult {
    const previousBody = this.finalAssistantMessage.body
    this.finalAssistantMessage = {
      ...this.finalAssistantMessage,
      body
    }

    const index = this.messageEntities.findIndex(message => message.id === this.finalAssistantMessage.id)
    if (index >= 0) {
      this.messageEntities[index] = this.finalAssistantMessage
    }

    return {
      message: this.finalAssistantMessage,
      patches: buildDifferentialSegmentPatches(previousBody, body),
      artifact: {
        kind: 'assistant_message_updated',
        messageId: this.finalAssistantMessage.id,
        role: 'assistant',
        content: typeof body.content === 'string' ? body.content : '',
        segments: body.segments || [],
        toolCalls: body.toolCalls
      }
    }
  }
}
