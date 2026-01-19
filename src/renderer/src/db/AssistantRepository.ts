import {
  invokeDbAssistantSave,
  invokeDbAssistantGetAll,
  invokeDbAssistantGetById,
  invokeDbAssistantUpdate,
  invokeDbAssistantDelete
} from '@renderer/invoker/ipcInvoker'

/**
 * 保存 Assistant
 */
const saveAssistant = async (data: Assistant): Promise<string> => {
  return await invokeDbAssistantSave(data)
}

/**
 * 获取所有 Assistants
 */
const getAllAssistants = async (): Promise<Assistant[]> => {
  return await invokeDbAssistantGetAll()
}

/**
 * 根据 ID 获取 Assistant
 */
const getAssistantById = async (id: string): Promise<Assistant | undefined> => {
  return await invokeDbAssistantGetById(id)
}

/**
 * 更新 Assistant
 */
const updateAssistant = async (data: Assistant): Promise<void> => {
  return await invokeDbAssistantUpdate(data)
}

/**
 * 删除 Assistant
 */
const deleteAssistant = async (id: string): Promise<boolean> => {
  await invokeDbAssistantDelete(id)
  return true
}

export {
  saveAssistant,
  getAllAssistants,
  getAssistantById,
  updateAssistant,
  deleteAssistant
}
