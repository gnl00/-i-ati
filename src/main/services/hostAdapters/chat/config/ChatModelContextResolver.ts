import type { ChatRunModelContext } from '@main/services/agentCore/types'

export class ChatModelContextResolver {
  resolve(config: IAppConfig, modelRef: ModelRef): ChatRunModelContext | null {
    const account = config.accounts?.find(item => item.id === modelRef.accountId)
    if (!account) {
      return null
    }

    const model = account.models.find(item => item.id === modelRef.modelId)
    if (!model) {
      return null
    }

    const providerDefinition = config.providerDefinitions?.find(def => def.id === account.providerId)
    if (!providerDefinition) {
      return null
    }

    return {
      model,
      account,
      providerDefinition
    }
  }

  resolveOrThrow(config: IAppConfig, modelRef: ModelRef): ChatRunModelContext {
    const context = this.resolve(config, modelRef)
    if (!context) {
      throw new Error('Model context not found')
    }
    return context
  }
}
