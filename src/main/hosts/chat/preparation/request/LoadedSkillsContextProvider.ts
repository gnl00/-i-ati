import { chatDb } from '@main/db/chat'
import { SkillService } from '@main/services/skills/SkillService'
import { buildLoadedSkillsContextMessage } from '@shared/services/skills/LoadedSkillsContext'

export class LoadedSkillsContextProvider {
  async build(chatId?: number): Promise<ChatMessage | null> {
    if (!chatId) {
      return null
    }

    try {
      const skillNames = chatDb.getSkills(chatId)
      if (skillNames.length === 0) {
        return null
      }

      const availableSkills = await SkillService.listSkills()
      const pathsByName = new Map(availableSkills.map(skill => [skill.name, skill.path]))
      const skills = skillNames.map(name => ({
        name,
        path: pathsByName.get(name)
      }))

      return buildLoadedSkillsContextMessage(skills)
    } catch (error) {
      console.warn('[Skills] Failed to build loaded skills context:', error)
      return null
    }
  }
}
