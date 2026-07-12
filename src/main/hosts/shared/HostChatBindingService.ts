import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { chatDb } from '@main/db/chat'

const DEFAULT_WORKSPACE_DIR = 'workspaces'

export type ResolveOrCreateHostChatBindingInput = {
  hostType: string
  hostChatId: string
  hostThreadId?: string
  hostUserId?: string
  title?: string
  modelRef?: ModelRef
  metadata?: Record<string, unknown>
}

export type ResolveOrCreateHostChatBindingResult = {
  chat: ChatEntity
  binding: ChatHostBindingEntity
  created: boolean
}

export class HostChatBindingService {
  async resolveOrCreate(input: ResolveOrCreateHostChatBindingInput): Promise<ResolveOrCreateHostChatBindingResult> {
    const existingBinding = chatDb.getChatHostBindingByHost(
      input.hostType,
      input.hostChatId,
      input.hostThreadId
    )

    if (existingBinding) {
      const chat = chatDb.getChatByUuid(existingBinding.chatUuid)
      if (chat) {
        return { chat, binding: existingBinding, created: false }
      }
    }

    const chatUuid = uuidv4()
    const now = Date.now()
    const workspacePath = `./${DEFAULT_WORKSPACE_DIR}/${chatUuid}`

    await fs.mkdir(path.join(app.getPath('userData'), DEFAULT_WORKSPACE_DIR, chatUuid), {
      recursive: true
    })

    const chat: ChatEntity = {
      uuid: chatUuid,
      title: input.title?.trim() || 'NewChat',
      messages: [],
      modelRef: input.modelRef,
      workspacePath,
      createTime: now,
      updateTime: now
    }
    chat.id = chatDb.saveChat(chat)

    const binding: ChatHostBindingEntity = {
      hostType: input.hostType,
      hostChatId: input.hostChatId,
      hostThreadId: input.hostThreadId,
      hostUserId: input.hostUserId,
      chatId: chat.id!,
      chatUuid: chat.uuid,
      status: 'active',
      metadata: input.metadata,
      createTime: now,
      updateTime: now
    }
    binding.id = chatDb.saveChatHostBinding(binding)

    return { chat, binding, created: true }
  }

  async createAndBind(input: ResolveOrCreateHostChatBindingInput): Promise<ResolveOrCreateHostChatBindingResult> {
    const existingBinding = chatDb.getChatHostBindingByHost(
      input.hostType,
      input.hostChatId,
      input.hostThreadId
    )

    const { chat, now } = await this.createChat(input)

    const binding: ChatHostBindingEntity = {
      id: existingBinding?.id,
      hostType: input.hostType,
      hostChatId: input.hostChatId,
      hostThreadId: input.hostThreadId,
      hostUserId: input.hostUserId,
      chatId: chat.id!,
      chatUuid: chat.uuid,
      lastHostMessageId: existingBinding?.lastHostMessageId,
      status: 'active',
      metadata: input.metadata,
      createTime: existingBinding?.createTime ?? now,
      updateTime: now
    }

    chatDb.upsertChatHostBinding(binding)
    const rebound = chatDb.getChatHostBindingByHost(
      input.hostType,
      input.hostChatId,
      input.hostThreadId
    )

    return {
      chat,
      binding: rebound ?? binding,
      created: true
    }
  }

  private async createChat(input: ResolveOrCreateHostChatBindingInput): Promise<{ chat: ChatEntity; now: number }> {
    const chatUuid = uuidv4()
    const now = Date.now()
    const workspacePath = `./${DEFAULT_WORKSPACE_DIR}/${chatUuid}`

    await fs.mkdir(path.join(app.getPath('userData'), DEFAULT_WORKSPACE_DIR, chatUuid), {
      recursive: true
    })

    const chat: ChatEntity = {
      uuid: chatUuid,
      title: input.title?.trim() || 'NewChat',
      messages: [],
      modelRef: input.modelRef,
      workspacePath,
      createTime: now,
      updateTime: now
    }
    chat.id = chatDb.saveChat(chat)

    return { chat, now }
  }
}
