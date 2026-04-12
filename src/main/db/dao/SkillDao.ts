import type Database from 'better-sqlite3'

interface SkillRow {
  chat_id: number
  skill_name: string
  load_order: number
  loaded_at: number
}

class SkillDao {
  private stmts: {
    insertSkill: Database.Statement
    deleteSkill: Database.Statement
    getSkillsByChatId: Database.Statement
    getSkillMaxOrder: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertSkill: db.prepare(`
        INSERT INTO chat_skills (chat_id, skill_name, load_order, loaded_at)
        VALUES (?, ?, ?, ?)
      `),
      deleteSkill: db.prepare(`
        DELETE FROM chat_skills WHERE chat_id = ? AND skill_name = ?
      `),
      getSkillsByChatId: db.prepare(`
        SELECT * FROM chat_skills WHERE chat_id = ? ORDER BY load_order ASC
      `),
      getSkillMaxOrder: db.prepare(`
        SELECT MAX(load_order) as max_order FROM chat_skills WHERE chat_id = ?
      `)
    }
  }

  getSkills(chatId: number): SkillRow[] {
    return this.stmts.getSkillsByChatId.all(chatId) as SkillRow[]
  }

  getMaxLoadOrder(chatId: number): number {
    const row = this.stmts.getSkillMaxOrder.get(chatId) as { max_order: number | null } | undefined
    return row?.max_order ?? 0
  }

  insertSkill(row: SkillRow): void {
    this.stmts.insertSkill.run(row.chat_id, row.skill_name, row.load_order, row.loaded_at)
  }

  removeSkill(chatId: number, skillName: string): void {
    this.stmts.deleteSkill.run(chatId, skillName)
  }
}

export { SkillDao }
export type { SkillRow }
