import { ipcMain } from 'electron'
import { createLogger } from '@main/logging/LogService'
import { modelsDevCacheService } from '@main/services/models/ModelsDevCacheService'
import { MODELS_GET_MODEL_CAPABILITIES } from '@shared/constants'
import type {
  GetModelCapabilitiesRequest,
  GetModelCapabilitiesResponse
} from '@shared/models/capabilities'

const logger = createLogger('ModelsIPC')

export function registerModelsHandlers(): void {
  ipcMain.handle(
    MODELS_GET_MODEL_CAPABILITIES,
    async (_event, request: GetModelCapabilitiesRequest): Promise<GetModelCapabilitiesResponse> => {
      const modelIds = Array.isArray(request?.modelIds) ? request.modelIds : []
      logger.info('model_capabilities.get', { count: modelIds.length })
      return modelsDevCacheService.getModelCapabilities(modelIds)
    }
  )
}
