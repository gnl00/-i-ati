import DatabaseService from '@main/db/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'
import { buildLoadedSkillsContextMessage } from '@shared/services/skills/LoadedSkillsContext'

export class LoadedSkillsContextProvider {
  async build(chatId?: number): Promise<ChatMessage | null> {
    if (!chatId) {
      return null
    }

    try {
      const skillNames = DatabaseService.getSkills(chatId)
      if (skillNames.length === 0) {
        return null
      }

      const skills = await Promise.all(skillNames.map(async name => ({
        name,
        content: await SkillService.getSkillContent(name)
      })))

      return buildLoadedSkillsContextMessage(skills)
    } catch (error) {
      console.warn('[Skills] Failed to build loaded skills context:', error)
      return null
    }
  }
}

