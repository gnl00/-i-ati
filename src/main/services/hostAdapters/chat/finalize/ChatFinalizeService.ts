import { ChatSessionStore, ChatStepStore } from '../persistence'

export class ChatFinalizeService {
  constructor(
    private readonly chatStepStore = new ChatStepStore(),
    private readonly chatSessionStore = new ChatSessionStore()
  ) {}

  finalizeAssistantMessage(
    placeholder: MessageEntity,
    finalAssistantMessage: MessageEntity
  ): number {
    return this.chatStepStore.finalizeAssistantMessage(placeholder, finalAssistantMessage)
  }

  finalizeChatEntity(
    chatEntity: ChatEntity,
    inputText: string,
    modelId: string
  ): ChatEntity {
    return this.chatSessionStore.finalizeChatEntity(chatEntity, inputText, modelId)
  }
}
