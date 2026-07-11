import {
  invokeDbSmartMessageDismiss,
  invokeDbSmartMessagesGetActive,
  invokeDbSmartMessagesRefresh
} from '@renderer/infrastructure/ipc'

export const getActiveSmartMessages = async (limit?: number): Promise<SmartMessageEntity[]> => {
  return await invokeDbSmartMessagesGetActive(limit)
}

export const dismissSmartMessage = async (id: string): Promise<void> => {
  return await invokeDbSmartMessageDismiss(id)
}

export const refreshSmartMessages = async (): Promise<SmartMessageGenerationResult> => {
  return await invokeDbSmartMessagesRefresh()
}
