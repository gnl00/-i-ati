import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/services/DatabaseService'
import type { MainChatRunInput } from '../preparation'

const DEFAULT_WORKSPACE_DIR = 'workspaces'
const MAX_TITLE_LENGTH = 30

export class ChatSessionStore {
  async resolveOrCreateChat(
    input: MainChatRunInput,
    model: AccountModel
  ): Promise<ChatEntity> {
    const existing = this.resolveExistingChat(input.chatId, input.chatUuid)
    if (existing) {
      return existing
    }

    const chatUuid = uuidv4()
    const workspacePath = `./${DEFAULT_WORKSPACE_DIR}/${chatUuid}`
    await fs.mkdir(path.join(app.getPath('userData'), DEFAULT_WORKSPACE_DIR, chatUuid), {
      recursive: true
    })

    const chatEntity: ChatEntity = {
      uuid: chatUuid,
      title: 'NewChat',
      messages: [],
      model: model.id,
      workspacePath,
      userInstruction: input.input.chatUserInstruction || '',
      createTime: Date.now(),
      updateTime: Date.now()
    }
    chatEntity.id = DatabaseService.saveChat(chatEntity)
    return chatEntity
  }

  loadHistoryMessages(chat: ChatEntity): MessageEntity[] {
    if (chat.id) {
      return DatabaseService.getMessagesByChatId(chat.id)
    }
    if (chat.uuid) {
      return DatabaseService.getMessagesByChatUuid(chat.uuid)
    }
    return []
  }

  resolveWorkspacePath(chat: ChatEntity): string {
    return chat.workspacePath || `./${DEFAULT_WORKSPACE_DIR}/${chat.uuid || 'tmp'}`
  }

  finalizeChatEntity(
    chatEntity: ChatEntity,
    inputText: string,
    modelId: string
  ): ChatEntity {
    const nextTitle = chatEntity.title && chatEntity.title !== 'NewChat'
      ? chatEntity.title
      : inputText.substring(0, MAX_TITLE_LENGTH)

    const updatedChat: ChatEntity = {
      ...chatEntity,
      title: nextTitle || chatEntity.title || 'NewChat',
      model: modelId,
      updateTime: Date.now()
    }

    DatabaseService.updateChat(updatedChat)

    return {
      ...this.reloadChatEntity(updatedChat),
      title: nextTitle || updatedChat.title
    }
  }

  updateChatTitle(chatEntity: ChatEntity, title: string): ChatEntity {
    const updatedChat: ChatEntity = {
      ...this.reloadChatEntity(chatEntity),
      title,
      updateTime: Date.now()
    }

    DatabaseService.updateChat(updatedChat)
    return updatedChat
  }

  reloadChatEntity(chatEntity: ChatEntity): ChatEntity {
    return chatEntity.id
      ? DatabaseService.getChatById(chatEntity.id) || chatEntity
      : chatEntity
  }

  private resolveExistingChat(chatId?: number, chatUuid?: string): ChatEntity | undefined {
    let chat: ChatEntity | undefined
    if (chatId) {
      chat = DatabaseService.getChatById(chatId)
    }
    if (!chat && chatUuid) {
      chat = DatabaseService.getChatByUuid(chatUuid)
    }
    return chat
  }
}
