import { configDb } from '@main/db/config'
import { RunRequestFactory } from '@main/hosts/chat/preparation/RunRequestFactory'
import type { RunRequestBuildResult } from '@main/hosts/chat/preparation/RunRequestFactory'
import type { CliModelConfig } from '@main/hosts/cli/CliInputAdapter'
import { mcpRuntimeService } from '@main/services/mcpRuntime'

export interface CliChatProfile extends RunRequestBuildResult {
  modelRef: ModelRef
  secrets: string[]
}

/** Use the same request preparation and configured auxiliary models as Chat. */
export const prepareCliChatProfile = async (
  chat: ChatEntity,
  instruction: string,
  modelConfig: CliModelConfig
): Promise<CliChatProfile> => {
  const config = configDb.getConfig()!
  const configuredAccount = config.accounts?.find(account => (
    account.apiUrl.replace(/\/+$/, '') === modelConfig.baseUrl
    && account.apiKey === modelConfig.apiKey
    && config.providerDefinitions?.some(provider => (
      provider.id === account.providerId && provider.adapterPluginId === modelConfig.adapterPluginId
    ))
  ))
  const provider = config.providerDefinitions?.find(item => item.id === configuredAccount?.providerId)
  const model: AccountModel = configuredAccount?.models.find(item => item.id === modelConfig.model)
    ?? { id: modelConfig.model, label: modelConfig.model, type: 'llm' }
  const account: ProviderAccount = configuredAccount ?? {
    id: 'cli', providerId: 'cli', label: 'CLI', apiUrl: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey, models: [model]
  }
  const extraTools: { name: string }[] = []
  for (const [name, server] of Object.entries(configDb.getMcpServerConfig().mcpServers ?? {})) {
    const connected = await mcpRuntimeService.connectServer({ name, ...server })
    if (!connected.result) throw new Error(`CLI MCP connection failed: ${name}`)
    extraTools.push(...connected.tools)
  }
  const userMessage: MessageEntity = {
    chatId: chat.id, chatUuid: chat.uuid,
    body: { role: 'user', content: instruction, segments: [], createdAt: Date.now() }
  }
  const built = await new RunRequestFactory().build({
    chat,
    workspacePath: chat.workspacePath!,
    historyMessages: [],
    modelContext: {
      account,
      model,
      providerDefinition: {
        ...provider,
        id: account.providerId,
        displayName: provider?.displayName ?? 'CLI',
        adapterPluginId: modelConfig.adapterPluginId,
        requestOverrides: modelConfig.requestOverrides ?? provider?.requestOverrides
      }
    }
  }, {
    messageBuffer: [userMessage],
    assistantDraft: { body: { role: 'assistant', content: '', segments: [] } },
    earlyEmittedMessageIds: []
  }, {
    textCtx: instruction,
    mediaCtx: [],
    tools: extraTools,
    stream: true,
    options: modelConfig.options
  })
  if (modelConfig.systemPrompt) built.requestSpec.systemPrompt = modelConfig.systemPrompt
  if (modelConfig.options?.thinking) {
    built.requestSpec.options = { ...built.requestSpec.options, ...modelConfig.options }
  }
  return {
    ...built,
    modelRef: { accountId: account.id, modelId: model.id },
    secrets: [modelConfig.apiKey, ...(config.accounts ?? []).map(item => item.apiKey)]
  }
}
