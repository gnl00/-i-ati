type LegacyModelSlotTools = {
  defaultModel?: ModelRef
  titleGenerateModel?: ModelRef
  titleGenerateEnabled?: boolean
}

type ModelSlotTools = NonNullable<IAppConfig['tools']> & LegacyModelSlotTools

const hasVisionToken = (items?: string[]): boolean => {
  return (items ?? []).some(item => {
    const token = item.toLowerCase()
    return token === 'image' || token === 'vision'
  })
}

export const isVisionModel = (model: AccountModel): boolean => {
  if (model.type === 'img_gen') {
    return false
  }

  if (model.type === 'vlm' || model.type === 'mllm') {
    return true
  }

  return hasVisionToken(model.modalities) || hasVisionToken(model.capabilities)
}

const normalizeModelSlotTools = (
  tools?: ModelSlotTools
): NonNullable<IAppConfig['tools']> | undefined => {
  if (!tools) {
    return undefined
  }

  const { defaultModel, titleGenerateModel } = tools
  const nextTools = { ...tools }
  delete nextTools.defaultModel
  delete nextTools.titleGenerateModel
  delete nextTools.titleGenerateEnabled

  if (!nextTools.mainModel && defaultModel) {
    nextTools.mainModel = defaultModel
  }

  if (!nextTools.liteModel && titleGenerateModel) {
    nextTools.liteModel = titleGenerateModel
  }

  return nextTools
}

export const normalizeAppConfigModelSlots = (config: IAppConfig): IAppConfig => {
  const nextTools = normalizeModelSlotTools(config.tools as ModelSlotTools | undefined)
  const nextConfigForUpdate = config.configForUpdate
    ? normalizeAppConfigModelSlots(config.configForUpdate)
    : undefined

  if (!nextTools && !nextConfigForUpdate) {
    return config
  }

  return {
    ...config,
    ...(nextTools ? { tools: nextTools } : {}),
    ...(nextConfigForUpdate ? { configForUpdate: nextConfigForUpdate } : {})
  }
}

const getTools = (config: IAppConfig): ModelSlotTools | undefined => (
  config.tools as ModelSlotTools | undefined
)

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

export const isVisionModelRefAvailable = (config: IAppConfig, ref?: ModelRef): boolean => {
  const context = findAvailableModelByRef(config, ref)
  return Boolean(context && isVisionModel(context.model))
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

export const resolveFirstAvailableVisionModelRef = (config: IAppConfig): ModelRef | undefined => {
  for (const account of config.accounts ?? []) {
    if (!isProviderEnabledForAccount(config, account)) {
      continue
    }

    const model = account.models.find(item => item.enabled !== false && isVisionModel(item))
    if (model) {
      return {
        accountId: account.id,
        modelId: model.id
      }
    }
  }

  return undefined
}

export const resolveMainModelRef = (config: IAppConfig): ModelRef | undefined => {
  const tools = getTools(config)
  if (isModelRefAvailable(config, tools?.mainModel)) {
    return tools?.mainModel
  }

  if (isModelRefAvailable(config, tools?.defaultModel)) {
    return tools?.defaultModel
  }

  return resolveFirstAvailableModelRef(config)
}

export const resolveLiteModelRef = (config: IAppConfig): ModelRef | undefined => {
  const tools = getTools(config)
  if (isModelRefAvailable(config, tools?.liteModel)) {
    return tools?.liteModel
  }

  if (isModelRefAvailable(config, tools?.titleGenerateModel)) {
    return tools?.titleGenerateModel
  }

  return resolveMainModelRef(config)
}

export const resolveVisionModelRef = (config: IAppConfig): ModelRef | undefined => {
  const tools = getTools(config)
  if (isVisionModelRefAvailable(config, tools?.visionModel)) {
    return tools?.visionModel
  }

  return resolveFirstAvailableVisionModelRef(config) ?? resolveMainModelRef(config)
}

export const resolveNewChatModelRef = (config: IAppConfig): ModelRef | undefined => {
  return resolveMainModelRef(config)
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
