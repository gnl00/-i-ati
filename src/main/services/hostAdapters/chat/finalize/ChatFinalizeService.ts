import { ChatSessionStore, ChatStepStore } from '../persistence'

export class ChatFinalizeService {
  constructor(
    private readonly chatStepStore = new ChatStepStore(),
    private readonly chatSessionStore = new ChatSessionStore()
  ) {}

  async finalizeAssistantMessage(
    placeholder: MessageEntity,
    finalAssistantMessage: MessageEntity
  ): Promise<number> {
    return this.chatStepStore.finalizeAssistantMessage(placeholder, finalAssistantMessage)
  }

  finalizeChatEntity(
    chatEntity: ChatEntity,
    inputText: string,
    modelRef: ModelRef
  ): ChatEntity {
    return this.chatSessionStore.finalizeChatEntity(chatEntity, inputText, modelRef)
  }
}
