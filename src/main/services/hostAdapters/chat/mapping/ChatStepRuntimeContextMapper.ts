import type { RunPreparationResult } from '../preparation'

export type ChatStepRuntimeContext = {
  messageEntities: MessageEntity[]
  chatId?: number
  chatUuid?: string
}

export class ChatStepRuntimeContextMapper {
  map(chatContext: RunPreparationResult['chatContext']): ChatStepRuntimeContext {
    return {
      messageEntities: chatContext.messageEntities,
      chatId: chatContext.chat.id,
      chatUuid: chatContext.chat.uuid
    }
  }
}
