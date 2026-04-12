import { ipcMain } from 'electron'
import { configDb } from '@main/db/config'
import { createLogger } from '@main/logging/LogService'
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

const logger = createLogger('DatabaseIPC')

export function registerProviderHandlers(): void {
  ipcMain.handle(DB_PROVIDER_DEFINITIONS_GET_ALL, async (_event) => {
    logger.info('provider_definitions.get_all')
    return configDb.getProviderDefinitions()
  })

  ipcMain.handle(DB_PROVIDER_DEFINITION_SAVE, async (_event, definition: ProviderDefinition) => {
    logger.info('provider_definition.save', { providerId: definition.id })
    return configDb.saveProviderDefinition(definition)
  })

  ipcMain.handle(DB_PROVIDER_DEFINITION_DELETE, async (_event, providerId: string) => {
    logger.info('provider_definition.delete', { providerId })
    return configDb.deleteProviderDefinition(providerId)
  })

  ipcMain.handle(DB_PROVIDER_ACCOUNTS_GET_ALL, async (_event) => {
    logger.info('provider_accounts.get_all')
    return configDb.getProviderAccounts()
  })

  ipcMain.handle(DB_PROVIDER_ACCOUNT_SAVE, async (_event, account: ProviderAccount) => {
    logger.info('provider_account.save', { accountId: account.id })
    return configDb.saveProviderAccount(account)
  })

  ipcMain.handle(DB_PROVIDER_ACCOUNT_DELETE, async (_event, accountId: string) => {
    logger.info('provider_account.delete', { accountId })
    return configDb.deleteProviderAccount(accountId)
  })

  ipcMain.handle(DB_PROVIDER_MODEL_SAVE, async (_event, data: { accountId: string; model: AccountModel }) => {
    logger.info('provider_model.save', { accountId: data.accountId, modelId: data.model.id })
    return configDb.saveProviderModel(data.accountId, data.model)
  })

  ipcMain.handle(DB_PROVIDER_MODEL_DELETE, async (_event, data: { accountId: string; modelId: string }) => {
    logger.info('provider_model.delete', { accountId: data.accountId, modelId: data.modelId })
    return configDb.deleteProviderModel(data.accountId, data.modelId)
  })

  ipcMain.handle(DB_PROVIDER_MODEL_SET_ENABLED, async (_event, data: { accountId: string; modelId: string; enabled: boolean }) => {
    logger.info('provider_model.set_enabled', { accountId: data.accountId, modelId: data.modelId, enabled: data.enabled })
    return configDb.setProviderModelEnabled(data.accountId, data.modelId, data.enabled)
  })
}
