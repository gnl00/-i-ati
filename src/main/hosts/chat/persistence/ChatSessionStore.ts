import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/db/DatabaseService'
import type { MainAgentRunInput } from '../preparation'
import { normalizePermissionApprovalMode } from '@tools/approval'

const DEFAULT_WORKSPACE_DIR = 'workspaces'

function isDefaultChatTitle(title?: string): boolean {
  return !title || title === 'NewChat'
}

export class ChatSessionStore {
  async resolveOrCreateChat(
    input: MainAgentRunInput
  ): Promise<ChatEntity> {
    const existing = this.resolveExistingChat(input.chatId, input.chatUuid)
    if (existing) {
      return existing
    }

    const chatUuid = uuidv4()
    const workspacePath = `./${DEFAULT_WORKSPACE_DIR}/${chatUuid}`
    const chatModelRef = input.chatModelRef ?? input.modelRef
    await fs.mkdir(path.join(app.getPath('userData'), DEFAULT_WORKSPACE_DIR, chatUuid), {
      recursive: true
    })

    const chatEntity: ChatEntity = {
      uuid: chatUuid,
      title: 'NewChat',
      messages: [],
      modelRef: chatModelRef,
      workspacePath,
      userInstruction: input.input.chatUserInstruction || '',
      permissionApprovalMode: normalizePermissionApprovalMode(input.input.permissionApprovalMode),
      createTime: Date.now(),
      updateTime: Date.now()
    }
    chatEntity.id = DatabaseService.saveChat(chatEntity)
    return chatEntity
  }

  loadHistoryMessages(chat: ChatEntity): MessageEntity[] {
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
    _inputText: string,
    modelRef: ModelRef,
    chatModelRef?: ModelRef
  ): ChatEntity {
    const latestChat = this.reloadChatEntity(chatEntity)
    const nextModelRef = chatModelRef ?? modelRef
    const nextTitle = isDefaultChatTitle(latestChat.title)
      ? 'NewChat'
      : latestChat.title

    const updatedChat: ChatEntity = {
      ...latestChat,
      title: nextTitle || latestChat.title || 'NewChat',
      modelRef: nextModelRef,
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
