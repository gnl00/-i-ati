import {
  invokeDbChatSkillAdd,
  invokeDbChatSkillRemove,
  invokeDbChatSkillsGet
} from '@renderer/infrastructure/ipc'

const addChatSkill = async (chatId: number, skillName: string): Promise<void> => {
  return await invokeDbChatSkillAdd({ chatId, skillName })
}

const removeChatSkill = async (chatId: number, skillName: string): Promise<void> => {
  return await invokeDbChatSkillRemove({ chatId, skillName })
}

const getChatSkills = async (chatId: number): Promise<string[]> => {
  return await invokeDbChatSkillsGet(chatId)
}

export {
  addChatSkill,
  removeChatSkill,
  getChatSkills
}
