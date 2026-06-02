import type { MessageSegmentPatch } from '@shared/chat/render-events'
import { buildDifferentialSegmentPatches } from '@shared/run/messagePatch'

export type CommitAssistantMessageResult = {
  message: MessageEntity
  patches: MessageSegmentPatch[]
}

export class CommittedAssistantMessageController {
  private finalAssistantMessage: MessageEntity

  constructor(
    assistantDraft: MessageEntity,
    private readonly messageEntities: MessageEntity[]
  ) {
    this.finalAssistantMessage = {
      ...assistantDraft,
      body: {
        ...assistantDraft.body
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
      patches: buildDifferentialSegmentPatches(previousBody, body)
    }
  }
}
