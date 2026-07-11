import { invokeSkillGetContent, invokeSkillList } from '@renderer/infrastructure/ipc'

const listAvailableSkills = async (): Promise<SkillMetadata[]> => {
  return await invokeSkillList()
}

const getSkillContent = async (name: string): Promise<string> => {
  return await invokeSkillGetContent(name)
}

export {
  listAvailableSkills,
  getSkillContent
}
