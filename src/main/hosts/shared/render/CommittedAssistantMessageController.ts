export type CommitAssistantMessageResult = {
  message: MessageEntity
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
    this.finalAssistantMessage = {
      ...this.finalAssistantMessage,
      body
    }

    const index = this.messageEntities.findIndex(message => message.id === this.finalAssistantMessage.id)
    if (index >= 0) {
      this.messageEntities[index] = this.finalAssistantMessage
    }

    // P2：此前这里会 buildDifferentialSegmentPatches(previousBody, body)，
    // 但唯一调用方（ChatRenderOutput.commitAssistantMessage）只取 message、丢弃 patches，
    // 属于第 3 处「先合并再 diff」的空转。既然结果无人消费，直接移除该 diff 计算。
    return {
      message: this.finalAssistantMessage
    }
  }
}
