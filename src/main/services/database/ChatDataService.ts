import type { ChatRepository } from '@main/db/repositories/ChatRepository'
import type { ChatSkillRepository } from '@main/db/repositories/ChatSkillRepository'

type ChatDataServiceDeps = {
  hasDb: () => boolean
  getChatRepo: () => ChatRepository | undefined
  getChatSkillRepo: () => ChatSkillRepository | undefined
}

export class ChatDataService {
  constructor(private readonly deps: ChatDataServiceDeps) {}

  saveChat(data: ChatEntity): number {
    const chatRepo = this.requireChatRepo()
    const now = Date.now()
    const row = {
      id: data.id ?? 0,
      uuid: data.uuid,
      title: data.title,
      msg_count: data.msgCount ?? 0,
      model: data.model ?? null,
      workspace_path: data.workspacePath ?? null,
      user_instruction: data.userInstruction ?? null,
      create_time: data.createTime ?? now,
      update_time: data.updateTime ?? now
    }
    return chatRepo.insertChat(row)
  }

  getAllChats(): ChatEntity[] {
    const chatRepo = this.requireChatRepo()
    const rows = chatRepo.getAllChats()
    return rows.map(row => this.mapChatRow(row))
  }

  getChatById(id: number): ChatEntity | undefined {
    const chatRepo = this.requireChatRepo()
    const row = chatRepo.getChatById(id)
    return row ? this.mapChatRow(row) : undefined
  }

  getChatByUuid(uuid: string): ChatEntity | undefined {
    const chatRepo = this.requireChatRepo()
    const row = chatRepo.getChatByUuid(uuid)
    return row ? this.mapChatRow(row) : undefined
  }

  getWorkspacePathByUuid(uuid: string): string | undefined {
    const chatRepo = this.requireChatRepo()
    return chatRepo.getWorkspacePathByUuid(uuid)
  }

  updateChat(data: ChatEntity): void {
    const chatRepo = this.requireChatRepo()
    if (!data.id) return

    const existing = chatRepo.getChatById(data.id)
    const userInstruction = data.userInstruction ?? existing?.user_instruction ?? null

    const row = {
      id: data.id,
      uuid: data.uuid,
      title: data.title,
      msg_count: data.msgCount ?? 0,
      model: data.model ?? null,
      workspace_path: data.workspacePath ?? null,
      user_instruction: userInstruction,
      create_time: data.createTime ?? Date.now(),
      update_time: data.updateTime ?? Date.now()
    }
    chatRepo.updateChat(row)
  }

  deleteChat(id: number): void {
    const chatRepo = this.requireChatRepo()
    chatRepo.deleteChat(id)
  }

  getChatSkills(chatId: number): string[] {
    const chatSkillRepo = this.requireChatSkillRepo()
    const rows = chatSkillRepo.getChatSkills(chatId)
    return rows.map(row => row.skill_name)
  }

  addChatSkill(chatId: number, skillName: string): void {
    const chatSkillRepo = this.requireChatSkillRepo()
    chatSkillRepo.addChatSkill(chatId, skillName)
  }

  removeChatSkill(chatId: number, skillName: string): void {
    const chatSkillRepo = this.requireChatSkillRepo()
    chatSkillRepo.removeChatSkill(chatId, skillName)
  }

  private mapChatRow(row: {
    id: number
    uuid: string
    title: string
    msg_count: number
    model: string | null
    workspace_path: string | null
    user_instruction: string | null
    create_time: number
    update_time: number
  }): ChatEntity {
    return {
      id: row.id,
      uuid: row.uuid,
      title: row.title,
      msgCount: row.msg_count,
      model: row.model ?? undefined,
      workspacePath: row.workspace_path ?? undefined,
      userInstruction: row.user_instruction ?? undefined,
      createTime: row.create_time,
      updateTime: row.update_time,
      messages: []
    }
  }

  private requireChatRepo(): ChatRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getChatRepo()
    if (!repo) throw new Error('Chat repository not initialized')
    return repo
  }

  private requireChatSkillRepo(): ChatSkillRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getChatSkillRepo()
    if (!repo) throw new Error('Chat skill repository not initialized')
    return repo
  }
}
