import {
  invokeDbChatSave,
  invokeDbChatGetAll,
  invokeDbChatGetById,
  invokeDbChatUpdate,
  invokeDbChatDelete
} from '@renderer/invoker/ipcInvoker'

// 添加数据
const saveChat = async (data: ChatEntity): Promise<number> => {
  return await invokeDbChatSave(data)
}

// 获取所有数据
const getAllChat = async (): Promise<ChatEntity[]> => {
  return await invokeDbChatGetAll()
}

// 根据ID获取数据
const getChatById = async (id: number): Promise<ChatEntity | undefined> => {
  return await invokeDbChatGetById(id)
}

// 更新数据
const updateChat = async (data: ChatEntity): Promise<void> => {
  return await invokeDbChatUpdate(data)
}

// 删除数据
const deleteChat = async (id: number): Promise<boolean> => {
  await invokeDbChatDelete(id)
  return true
}

export { saveChat, getAllChat, getChatById, updateChat, deleteChat }
