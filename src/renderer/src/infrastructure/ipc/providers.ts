import type { GetModelCapabilitiesRequest, GetModelCapabilitiesResponse } from '@shared/models/capabilities'
import type { FetchProviderModelsRequest, FetchProviderModelsResponse } from '@shared/providers/fetchModels'
import type { ProviderTestConnectionRequest, ProviderTestConnectionResponse } from '@shared/providers/testConnection'
import {
  DB_PROVIDER_ACCOUNT_DELETE,
  DB_PROVIDER_ACCOUNT_SAVE,
  DB_PROVIDER_ACCOUNTS_GET_ALL,
  DB_PROVIDER_DEFINITION_DELETE,
  DB_PROVIDER_DEFINITION_SAVE,
  DB_PROVIDER_DEFINITIONS_GET_ALL,
  DB_PROVIDER_MODEL_DELETE,
  DB_PROVIDER_MODEL_SAVE,
  DB_PROVIDER_MODEL_SET_ENABLED,
  MODELS_GET_MODEL_CAPABILITIES,
  PROVIDER_FETCH_MODELS,
  PROVIDER_TEST_CONNECTION
} from '@shared/constants/index'
import { invokeIpc } from './client'

export const invokeDbProviderDefinitionsGetAll = (): Promise<ProviderDefinition[]> => invokeIpc(DB_PROVIDER_DEFINITIONS_GET_ALL)
export const invokeDbProviderDefinitionSave = (definition: ProviderDefinition): Promise<void> => invokeIpc(DB_PROVIDER_DEFINITION_SAVE, definition)
export const invokeDbProviderDefinitionDelete = (providerId: string): Promise<void> => invokeIpc(DB_PROVIDER_DEFINITION_DELETE, providerId)
export const invokeDbProviderAccountsGetAll = (): Promise<ProviderAccount[]> => invokeIpc(DB_PROVIDER_ACCOUNTS_GET_ALL)
export const invokeDbProviderAccountSave = (account: ProviderAccount): Promise<void> => invokeIpc(DB_PROVIDER_ACCOUNT_SAVE, account)
export const invokeDbProviderAccountDelete = (accountId: string): Promise<void> => invokeIpc(DB_PROVIDER_ACCOUNT_DELETE, accountId)
export const invokeDbProviderModelSave = (data: { accountId: string; model: AccountModel }): Promise<void> => invokeIpc(DB_PROVIDER_MODEL_SAVE, data)
export const invokeDbProviderModelDelete = (data: { accountId: string; modelId: string }): Promise<void> => invokeIpc(DB_PROVIDER_MODEL_DELETE, data)
export const invokeDbProviderModelSetEnabled = (data: { accountId: string; modelId: string; enabled: boolean }): Promise<void> =>
  invokeIpc(DB_PROVIDER_MODEL_SET_ENABLED, data)
export const invokeProviderTestConnection = (request: ProviderTestConnectionRequest): Promise<ProviderTestConnectionResponse> =>
  invokeIpc(PROVIDER_TEST_CONNECTION, request)
export const invokeProviderFetchModels = (request: FetchProviderModelsRequest): Promise<FetchProviderModelsResponse> =>
  invokeIpc(PROVIDER_FETCH_MODELS, request)
export const invokeModelsGetModelCapabilities = (request: GetModelCapabilitiesRequest): Promise<GetModelCapabilitiesResponse> =>
  invokeIpc(MODELS_GET_MODEL_CAPABILITIES, request)
