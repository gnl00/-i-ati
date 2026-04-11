import type {
  AgentMessageEventSink,
  ConversationStore
} from '@main/services/agentCore/ports'
import type {
  AgentStepCommitter,
  AssistantCycleSnapshot
} from '@main/services/agentCore/execution'
import type { StepArtifact } from '@main/services/agentCore/types'
import { assertChatMessageSegmentsHaveIds, assertMessageEntitySegmentsHaveIds } from '@shared/chatRun/segmentId'
import { AssistantStepAssembler } from './AssistantStepAssembler'

export class ChatStepCommitter implements AgentStepCommitter {
  private lastUsage?: ITokenUsage
  private readonly artifacts: StepArtifact[] = []
  private readonly assembler: AssistantStepAssembler

  constructor(
    private readonly messageEntities: MessageEntity[],
    private readonly messageEvents: AgentMessageEventSink,
    private readonly conversationStore: ConversationStore,
    private readonly chatId?: number,
    private readonly chatUuid?: string
  ) {
    this.assembler = new AssistantStepAssembler(this.getFinalAssistantMessage().body)
  }

  beginCycle(): void {
    this.assembler.beginCycle()
  }

  updateStreamPreview(snapshot: AssistantCycleSnapshot): void {
    const baseMessage = this.getFinalAssistantMessage()
    const { previewBody } = this.assembler.updatePreview(snapshot)
    if (!previewBody) return
    const previewMessage: MessageEntity = {
      chatId: baseMessage.chatId,
      chatUuid: baseMessage.chatUuid,
      body: previewBody
    }

    assertMessageEntitySegmentsHaveIds(previewMessage, 'legacy-chat-step-committer:stream-preview')
    this.messageEvents.emitStreamPreviewUpdated(previewMessage)
  }

  clearStreamPreview(): void {
    this.assembler.clearPreview()
    this.messageEvents.emitStreamPreviewCleared()
  }

  commitToolOnlyCycle(snapshot: AssistantCycleSnapshot): void {
    const message = this.getFinalAssistantMessage()
    const { committedBody } = this.assembler.commitToolCycle(snapshot)
    const updated: MessageEntity = {
      ...message,
      body: committedBody
    }

    this.replaceAssistantMessage(updated)
  }

  commitFinalCycle(snapshot: AssistantCycleSnapshot): void {
    const message = this.getFinalAssistantMessage()
    const { committedBody } = this.assembler.commitFinalCycle(snapshot)
    const updated: MessageEntity = {
      ...message,
      body: committedBody
    }

    this.replaceAssistantMessage(updated)
  }

  setLastUsage(usage: ITokenUsage): void {
    this.lastUsage = usage
  }

  getLastUsage(): ITokenUsage | undefined {
    return this.lastUsage
  }

  async commitToolResult(toolMsg: ChatMessage): Promise<void> {
    assertChatMessageSegmentsHaveIds(toolMsg, 'legacy-chat-step-committer:tool-result')
    try {
      const entity = this.conversationStore.persistToolResultMessage(
        toolMsg,
        this.chatId,
        this.chatUuid
      )
      this.artifacts.push({
        kind: 'tool_result_created',
        toolCallId: toolMsg.toolCallId || '',
        messageId: entity.id,
        message: entity.body
      })
      this.messageEntities.push(entity)
      this.messageEvents.emitToolResultAttached(toolMsg.toolCallId || '', entity)
    } catch (error) {
      console.warn('[ChatRun] Failed to persist tool result message', error)
    }
  }

  getFinalAssistantMessage(): MessageEntity {
    const index = this.findLastAssistantIndex()
    if (index < 0) {
      throw new Error('No assistant message found')
    }
    return this.messageEntities[index]
  }

  getArtifacts(): StepArtifact[] {
    return [...this.artifacts]
  }

  private replaceAssistantMessage(updated: MessageEntity): void {
    const index = this.findLastAssistantIndex()
    if (index < 0) {
      throw new Error('No assistant message found')
    }
    this.messageEntities[index] = updated
    this.artifacts.push({
      kind: 'assistant_message_updated',
      messageId: updated.id,
      role: 'assistant',
      content: typeof updated.body.content === 'string' ? updated.body.content : '',
      segments: updated.body.segments || [],
      toolCalls: updated.body.toolCalls
    })
    assertMessageEntitySegmentsHaveIds(updated, 'legacy-chat-step-committer:message-updated')
    this.messageEvents.emitMessageUpdated(updated)
  }

  private findLastAssistantIndex(): number {
    for (let i = this.messageEntities.length - 1; i >= 0; i -= 1) {
      if (this.messageEntities[i].body.role === 'assistant') {
        return i
      }
    }
    return -1
  }
}
