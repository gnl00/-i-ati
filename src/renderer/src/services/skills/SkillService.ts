import { invokeSkillGetContent, invokeSkillList } from '@renderer/invoker/ipcInvoker'

const listInstalledSkills = async (): Promise<SkillMetadata[]> => {
  return await invokeSkillList()
}

const getSkillContent = async (name: string): Promise<string> => {
  return await invokeSkillGetContent(name)
}

export {
  listInstalledSkills,
  getSkillContent
}
