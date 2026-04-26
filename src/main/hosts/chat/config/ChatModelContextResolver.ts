import type { RunModelContext } from '@main/agent/contracts'

export class ChatModelContextResolver {
  resolve(config: IAppConfig, modelRef: ModelRef): RunModelContext | null {
    const account = config.accounts?.find(item => item.id === modelRef.accountId)
    if (!account) {
      return null
    }

    const model = account.models.find(item => item.id === modelRef.modelId && item.enabled !== false)
    if (!model) {
      return null
    }

    const providerDefinition = config.providerDefinitions?.find(def => def.id === account.providerId)
    if (!providerDefinition) {
      return null
    }
    if (providerDefinition.enabled === false) {
      return null
    }

    return {
      model,
      account,
      providerDefinition
    }
  }

  resolveOrThrow(config: IAppConfig, modelRef: ModelRef): RunModelContext {
    const context = this.resolve(config, modelRef)
    if (!context) {
      throw new Error('Model context not found')
    }
    return context
  }
}
