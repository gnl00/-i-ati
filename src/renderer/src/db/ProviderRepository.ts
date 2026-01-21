import {
  invokeDbProviderAccountDelete,
  invokeDbProviderAccountSave,
  invokeDbProviderAccountsGetAll,
  invokeDbProviderDefinitionDelete,
  invokeDbProviderDefinitionSave,
  invokeDbProviderDefinitionsGetAll,
  invokeDbProviderModelDelete,
  invokeDbProviderModelSave,
  invokeDbProviderModelSetEnabled
} from '@renderer/invoker/ipcInvoker'

const getProviderDefinitions = async (): Promise<ProviderDefinition[]> => {
  return await invokeDbProviderDefinitionsGetAll()
}

const saveProviderDefinition = async (definition: ProviderDefinition): Promise<void> => {
  return await invokeDbProviderDefinitionSave(definition)
}

const deleteProviderDefinition = async (providerId: string): Promise<void> => {
  return await invokeDbProviderDefinitionDelete(providerId)
}

const getProviderAccounts = async (): Promise<ProviderAccount[]> => {
  return await invokeDbProviderAccountsGetAll()
}

const saveProviderAccount = async (account: ProviderAccount): Promise<void> => {
  return await invokeDbProviderAccountSave(account)
}

const deleteProviderAccount = async (accountId: string): Promise<void> => {
  return await invokeDbProviderAccountDelete(accountId)
}

const saveProviderModel = async (accountId: string, model: AccountModel): Promise<void> => {
  return await invokeDbProviderModelSave({ accountId, model })
}

const deleteProviderModel = async (accountId: string, modelId: string): Promise<void> => {
  return await invokeDbProviderModelDelete({ accountId, modelId })
}

const setProviderModelEnabled = async (accountId: string, modelId: string, enabled: boolean): Promise<void> => {
  return await invokeDbProviderModelSetEnabled({ accountId, modelId, enabled })
}

export {
  getProviderDefinitions,
  saveProviderDefinition,
  deleteProviderDefinition,
  getProviderAccounts,
  saveProviderAccount,
  deleteProviderAccount,
  saveProviderModel,
  deleteProviderModel,
  setProviderModelEnabled
}
