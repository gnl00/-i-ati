import { ChatSessionStore, ChatStepStore } from '../persistence'

export class ChatFinalizeService {
  constructor(
    private readonly chatStepStore = new ChatStepStore(),
    private readonly chatSessionStore = new ChatSessionStore()
  ) {}

  async finalizeAssistantMessage(
    chatEntity: ChatEntity,
    finalAssistantMessage: MessageEntity,
    usage?: ITokenUsage
  ): Promise<MessageEntity> {
    return this.chatStepStore.finalizeAssistantMessage(chatEntity, finalAssistantMessage, usage)
  }

  async settleAbortedAssistantMessage(
    chatEntity: ChatEntity,
    lastAssistantMessage: MessageEntity
  ): Promise<MessageEntity | undefined> {
    return this.chatStepStore.settleAbortedAssistantMessage(chatEntity, lastAssistantMessage)
  }

  finalizeChatEntity(
    chatEntity: ChatEntity,
    inputText: string,
    modelRef: ModelRef
  ): ChatEntity {
    return this.chatSessionStore.finalizeChatEntity(chatEntity, inputText, modelRef)
  }
}
