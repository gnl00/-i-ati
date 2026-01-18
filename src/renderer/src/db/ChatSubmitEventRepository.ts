import { invokeDbChatSubmitEventSave } from '@renderer/invoker/ipcInvoker'

const saveChatSubmitEvent = async (data: ChatSubmitEventTrace): Promise<number> => {
  return await invokeDbChatSubmitEventSave(data)
}

export { saveChatSubmitEvent }
