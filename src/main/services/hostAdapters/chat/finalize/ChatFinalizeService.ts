import { ChatSessionStore, ChatStepStore } from '../persistence'

export class ChatFinalizeService {
  constructor(
    private readonly chatStepStore = new ChatStepStore(),
    private readonly chatSessionStore = new ChatSessionStore()
  ) {}

  async finalizeAssistantMessage(
    placeholder: MessageEntity,
    finalAssistantMessage: MessageEntity
  ): Promise<MessageEntity> {
    return this.chatStepStore.finalizeAssistantMessage(placeholder, finalAssistantMessage)
  }

  async settleAbortedAssistantMessage(
    placeholder: MessageEntity,
    lastAssistantMessage: MessageEntity
  ): Promise<number | undefined> {
    return this.chatStepStore.settleAbortedAssistantMessage(placeholder, lastAssistantMessage)
  }

  finalizeChatEntity(
    chatEntity: ChatEntity,
    inputText: string,
    modelRef: ModelRef
  ): ChatEntity {
    return this.chatSessionStore.finalizeChatEntity(chatEntity, inputText, modelRef)
  }
}
