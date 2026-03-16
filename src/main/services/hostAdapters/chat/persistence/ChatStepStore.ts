import { extractContentFromSegments } from '@main/services/agentCore/execution'
import type { ConversationStore } from '@main/services/agentCore/contracts'
import DatabaseService from '@main/services/DatabaseService'
import type { ChatRunInputState } from '../preparation'

const buildUserMessage = (
  model: AccountModel,
  textCtx: string,
  mediaCtx: ClipbordImg[] | string[]
): ChatMessage => {
  const createdAt = Date.now()
  let messageBody: ChatMessage = { role: 'user', content: '', segments: [], createdAt }

  if (model.type === 'llm' || model.type === 't2i') {
    return { ...messageBody, content: textCtx.trim() }
  }

  if (model.type === 'vlm') {
    const imgContents: VLMContent[] = mediaCtx.map((imgBase64) => ({
      type: 'image_url' as const,
      image_url: { url: imgBase64 as string, detail: 'auto' as const }
    }))

    return {
      ...messageBody,
      content: [...imgContents, { type: 'text', text: textCtx.trim() }]
    }
  }

  throw new Error('Unsupported model type')
}

export class ChatStepStore implements ConversationStore {
  createUserMessage(
    chatEntity: ChatEntity,
    model: AccountModel,
    input: ChatRunInputState
  ): MessageEntity {
    const entity: MessageEntity = {
      body: buildUserMessage(model, input.textCtx, input.mediaCtx),
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid
    }

    entity.id = DatabaseService.saveMessage(entity)
    this.attachMessageToChat(chatEntity, entity.id)
    return entity
  }

  createAssistantPlaceholder(
    chatEntity: ChatEntity,
    model: AccountModel,
    modelRef: ModelRef
  ): MessageEntity {
    const entity: MessageEntity = {
      body: {
        createdAt: Date.now(),
        role: 'assistant',
        model: model.label,
        modelRef,
        content: '',
        segments: [],
        typewriterCompleted: false
      },
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid
    }

    entity.id = DatabaseService.saveMessage(entity)
    this.attachMessageToChat(chatEntity, entity.id)
    return entity
  }

  persistToolResultMessage(
    toolMsg: ChatMessage,
    chatId?: number,
    chatUuid?: string
  ): MessageEntity {
    const entity: MessageEntity = {
      body: toolMsg,
      chatId,
      chatUuid
    }

    entity.id = DatabaseService.saveMessage(entity)
    return entity
  }

  finalizeAssistantMessage(
    placeholder: MessageEntity,
    finalAssistantMessage: MessageEntity
  ): number {
    const content = finalAssistantMessage.body.segments?.length
      ? extractContentFromSegments(finalAssistantMessage.body.segments)
      : finalAssistantMessage.body.content

    const updated: MessageEntity = {
      ...placeholder,
      body: {
        ...finalAssistantMessage.body,
        content,
        typewriterCompleted: true,
        source: finalAssistantMessage.body.source ?? 'schedule'
      }
    }

    DatabaseService.updateMessage(updated)
    return updated.id || -1
  }

  private attachMessageToChat(chatEntity: ChatEntity, messageId?: number): void {
    if (messageId == null) {
      return
    }

    chatEntity.messages = [...(chatEntity.messages || []), messageId]
    chatEntity.updateTime = Date.now()
    DatabaseService.updateChat(chatEntity)
  }
}
