import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import {
  DB_PROVIDER_DEFINITIONS_GET_ALL,
  DB_PROVIDER_DEFINITION_SAVE,
  DB_PROVIDER_DEFINITION_DELETE,
  DB_PROVIDER_ACCOUNTS_GET_ALL,
  DB_PROVIDER_ACCOUNT_SAVE,
  DB_PROVIDER_ACCOUNT_DELETE,
  DB_PROVIDER_MODEL_SAVE,
  DB_PROVIDER_MODEL_DELETE,
  DB_PROVIDER_MODEL_SET_ENABLED
} from '@shared/constants'

export function registerProviderHandlers(): void {
  ipcMain.handle(DB_PROVIDER_DEFINITIONS_GET_ALL, async (_event) => {
    console.log('[Database IPC] Get provider definitions')
    return DatabaseService.getProviderDefinitions()
  })

  ipcMain.handle(DB_PROVIDER_DEFINITION_SAVE, async (_event, definition: ProviderDefinition) => {
    console.log(`[Database IPC] Save provider definition: ${definition.id}`)
    return DatabaseService.saveProviderDefinition(definition)
  })

  ipcMain.handle(DB_PROVIDER_DEFINITION_DELETE, async (_event, providerId: string) => {
    console.log(`[Database IPC] Delete provider definition: ${providerId}`)
    return DatabaseService.deleteProviderDefinition(providerId)
  })

  ipcMain.handle(DB_PROVIDER_ACCOUNTS_GET_ALL, async (_event) => {
    console.log('[Database IPC] Get provider accounts')
    return DatabaseService.getProviderAccounts()
  })

  ipcMain.handle(DB_PROVIDER_ACCOUNT_SAVE, async (_event, account: ProviderAccount) => {
    console.log(`[Database IPC] Save provider account: ${account.id}`)
    return DatabaseService.saveProviderAccount(account)
  })

  ipcMain.handle(DB_PROVIDER_ACCOUNT_DELETE, async (_event, accountId: string) => {
    console.log(`[Database IPC] Delete provider account: ${accountId}`)
    return DatabaseService.deleteProviderAccount(accountId)
  })

  ipcMain.handle(DB_PROVIDER_MODEL_SAVE, async (_event, data: { accountId: string; model: AccountModel }) => {
    console.log(`[Database IPC] Save provider model: ${data.accountId}/${data.model.id}`)
    return DatabaseService.saveProviderModel(data.accountId, data.model)
  })

  ipcMain.handle(DB_PROVIDER_MODEL_DELETE, async (_event, data: { accountId: string; modelId: string }) => {
    console.log(`[Database IPC] Delete provider model: ${data.accountId}/${data.modelId}`)
    return DatabaseService.deleteProviderModel(data.accountId, data.modelId)
  })

  ipcMain.handle(DB_PROVIDER_MODEL_SET_ENABLED, async (_event, data: { accountId: string; modelId: string; enabled: boolean }) => {
    console.log(`[Database IPC] Set provider model enabled: ${data.accountId}/${data.modelId} => ${data.enabled}`)
    return DatabaseService.setProviderModelEnabled(data.accountId, data.modelId, data.enabled)
  })
}
