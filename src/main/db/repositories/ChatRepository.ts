import type { ChatDao } from '@main/db/dao/ChatDao'
import type { SkillDao } from '@main/db/dao/SkillDao'
import { toChatEntity, toChatRow } from '@main/db/mappers/ChatMapper'

type ChatRepositoryDeps = {
  hasDb: () => boolean
  getChatRepo: () => ChatDao | undefined
  getSkillRepo: () => SkillDao | undefined
}

export class ChatRepository {
  constructor(private readonly deps: ChatRepositoryDeps) {}

  saveChat(data: ChatEntity): number {
    const chatRepo = this.requireChatRepo()
    return chatRepo.insertChat(toChatRow(data))
  }

  getAllChats(): ChatEntity[] {
    const chatRepo = this.requireChatRepo()
    const rows = chatRepo.getAllChats()
    return rows.map(toChatEntity)
  }

  getChatById(id: number): ChatEntity | undefined {
    const chatRepo = this.requireChatRepo()
    const row = chatRepo.getChatById(id)
    return row ? toChatEntity(row) : undefined
  }

  getChatByUuid(uuid: string): ChatEntity | undefined {
    const chatRepo = this.requireChatRepo()
    const row = chatRepo.getChatByUuid(uuid)
    return row ? toChatEntity(row) : undefined
  }

  getWorkspacePathByUuid(uuid: string): string | undefined {
    const chatRepo = this.requireChatRepo()
    return chatRepo.getWorkspacePathByUuid(uuid)
  }

  updateChat(data: ChatEntity): void {
    const chatRepo = this.requireChatRepo()
    if (!data.id) return

    const existing = chatRepo.getChatById(data.id)
    chatRepo.updateChat(toChatRow(data, Date.now(), {
      id: data.id,
      user_instruction: data.userInstruction ?? existing?.user_instruction ?? null
    }))
  }

  deleteChat(id: number): void {
    const chatRepo = this.requireChatRepo()
    chatRepo.deleteChat(id)
  }

  getSkills(chatId: number): string[] {
    const skillRepo = this.requireSkillRepo()
    const rows = skillRepo.getSkills(chatId)
    return rows.map(row => row.skill_name)
  }

  addSkill(chatId: number, skillName: string): void {
    const skillRepo = this.requireSkillRepo()
    skillRepo.insertSkill({
      chat_id: chatId,
      skill_name: skillName,
      load_order: skillRepo.getMaxLoadOrder(chatId) + 1,
      loaded_at: Date.now()
    })
  }

  removeSkill(chatId: number, skillName: string): void {
    const skillRepo = this.requireSkillRepo()
    skillRepo.removeSkill(chatId, skillName)
  }

  private requireChatRepo(): ChatDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getChatRepo()
    if (!repo) throw new Error('Chat repository not initialized')
    return repo
  }

  private requireSkillRepo(): SkillDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getSkillRepo()
    if (!repo) throw new Error('Skill DAO not initialized')
    return repo
  }
}
