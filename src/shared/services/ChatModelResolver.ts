const findAvailableModelByRef = (
  config: IAppConfig,
  ref?: ModelRef
): { account: ProviderAccount; model: AccountModel } | undefined => {
  if (!ref) {
    return undefined
  }

  const account = config.accounts?.find(item => item.id === ref.accountId)
  if (!account) {
    return undefined
  }

  if (!isProviderEnabledForAccount(config, account)) {
    return undefined
  }

  const model = account.models.find(item => item.id === ref.modelId && item.enabled !== false)
  if (!model) {
    return undefined
  }

  return { account, model }
}

const isProviderEnabledForAccount = (config: IAppConfig, account: ProviderAccount): boolean => {
  const definition = config.providerDefinitions?.find(item => item.id === account.providerId)
  return definition?.enabled !== false
}

export const isModelRefAvailable = (config: IAppConfig, ref?: ModelRef): boolean => {
  return Boolean(findAvailableModelByRef(config, ref))
}

export const resolveFirstAvailableModelRef = (config: IAppConfig): ModelRef | undefined => {
  for (const account of config.accounts ?? []) {
    if (!isProviderEnabledForAccount(config, account)) {
      continue
    }

    const model = account.models.find(item => item.enabled !== false)
    if (model) {
      return {
        accountId: account.id,
        modelId: model.id
      }
    }
  }

  return undefined
}

export const resolveNewChatModelRef = (config: IAppConfig): ModelRef | undefined => {
  if (isModelRefAvailable(config, config.tools?.defaultModel)) {
    return config.tools?.defaultModel
  }

  return resolveFirstAvailableModelRef(config)
}

export const resolveStoredChatModelRef = (
  config: IAppConfig,
  chat?: Pick<ChatEntity, 'modelRef'> | null
): ModelRef | undefined => {
  const chatModelRef = chat?.modelRef
  if (!chatModelRef) {
    return undefined
  }

  return isModelRefAvailable(config, chatModelRef)
    ? {
      accountId: chatModelRef.accountId,
      modelId: chatModelRef.modelId
    }
    : undefined
}

export const resolveHistoryChatModelRef = (
  config: IAppConfig,
  messages?: MessageEntity[]
): ModelRef | undefined => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return undefined
  }

  const lastAssistantWithModelRef = [...messages]
    .reverse()
    .find(message => message.body.role === 'assistant' && message.body.modelRef)

  const modelRef = lastAssistantWithModelRef?.body.modelRef
  if (!modelRef) {
    return undefined
  }

  return isModelRefAvailable(config, modelRef)
    ? {
      accountId: modelRef.accountId,
      modelId: modelRef.modelId
    }
    : undefined
}

export const resolveExistingChatModelRef = (
  config: IAppConfig,
  chat?: ChatEntity | null,
  messages?: MessageEntity[]
): ModelRef | undefined => {
  return resolveStoredChatModelRef(config, chat)
    ?? resolveHistoryChatModelRef(config, messages)
    ?? resolveNewChatModelRef(config)
}
