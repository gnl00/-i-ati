import {
  invokeDbMessageSave,
  invokeDbMessageGetAll,
  invokeDbMessageGetById,
  invokeDbMessageGetByIds,
  invokeDbMessageUpdate,
  invokeDbMessageDelete
} from '@renderer/invoker/ipcInvoker'

// 添加数据
const saveMessage = async (data: MessageEntity): Promise<number> => {
  return await invokeDbMessageSave(data)
}

// 获取所有数据
const getAllMessage = async (): Promise<MessageEntity[]> => {
  return await invokeDbMessageGetAll()
}

// 根据ID获取数据
const getMessageById = async (id: number): Promise<MessageEntity | undefined> => {
  return await invokeDbMessageGetById(id)
}

// 根据多个ID获取数据
const getMessageByIds = async (ids: number[]): Promise<MessageEntity[]> => {
  return await invokeDbMessageGetByIds(ids)
}

// 更新数据
const updateMessage = async (data: MessageEntity): Promise<void> => {
  return await invokeDbMessageUpdate(data)
}

// 删除数据
const deleteMessage = async (id: number): Promise<void> => {
  return await invokeDbMessageDelete(id)
}

export { saveMessage, getAllMessage, getMessageById, getMessageByIds, updateMessage, deleteMessage }
