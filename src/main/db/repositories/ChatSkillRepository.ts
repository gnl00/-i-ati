import type Database from 'better-sqlite3'

interface ChatSkillRow {
  chat_id: number
  skill_name: string
  load_order: number
  loaded_at: number
}

class ChatSkillRepository {
  private stmts: {
    insertChatSkill: Database.Statement
    deleteChatSkill: Database.Statement
    getChatSkillsByChatId: Database.Statement
    getChatSkillMaxOrder: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertChatSkill: db.prepare(`
        INSERT INTO chat_skills (chat_id, skill_name, load_order, loaded_at)
        VALUES (?, ?, ?, ?)
      `),
      deleteChatSkill: db.prepare(`
        DELETE FROM chat_skills WHERE chat_id = ? AND skill_name = ?
      `),
      getChatSkillsByChatId: db.prepare(`
        SELECT * FROM chat_skills WHERE chat_id = ? ORDER BY load_order ASC
      `),
      getChatSkillMaxOrder: db.prepare(`
        SELECT MAX(load_order) as max_order FROM chat_skills WHERE chat_id = ?
      `)
    }
  }

  getChatSkills(chatId: number): ChatSkillRow[] {
    return this.stmts.getChatSkillsByChatId.all(chatId) as ChatSkillRow[]
  }

  addChatSkill(chatId: number, skillName: string): void {
    const row = this.stmts.getChatSkillMaxOrder.get(chatId) as { max_order: number | null } | undefined
    const maxOrder = row?.max_order ?? 0
    this.stmts.insertChatSkill.run(chatId, skillName, maxOrder + 1, Date.now())
  }

  removeChatSkill(chatId: number, skillName: string): void {
    this.stmts.deleteChatSkill.run(chatId, skillName)
  }
}

export { ChatSkillRepository }
export type { ChatSkillRow }
