import { configDb } from '@main/db/config'
import type { HostRunInputState } from '@main/hosts/chat/preparation/types'
import type { RunModelContext } from '@main/agent/contracts'
import type { CliModelConfig } from '@main/hosts/cli/CliInputAdapter'
import { mcpRuntimeService } from '@main/services/mcpRuntime'

export interface CliChatProfile {
  modelContext: RunModelContext
  tools: NonNullable<HostRunInputState['tools']>
  systemPrompt?: string
  options?: IUnifiedRequest['options']
  modelRef: ModelRef
  secrets: string[]
}

/** Resolve explicit CLI model and MCP inputs; RunService owns request preparation. */
export const prepareCliChatProfile = async (
  modelConfig: CliModelConfig
): Promise<CliChatProfile> => {
  const config = configDb.getConfig()!
  const configuredAccount = config.accounts?.find(account =>
      account.apiUrl.replace(/\/+$/, '') === modelConfig.baseUrl
    && account.apiKey === modelConfig.apiKey
    && config.providerDefinitions?.some(provider =>
          provider.id === account.providerId && provider.adapterPluginId === modelConfig.adapterPluginId
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
    if (server.enabled !== true) continue
    const connected = await mcpRuntimeService.connectServer({ name, ...server })
    if (!connected.result) throw new Error(`CLI MCP connection failed: ${name}`)
    extraTools.push(...connected.tools.map(tool => ({
      ...tool.function, source: tool.source, serverName: tool.serverName, originalName: tool.originalName
    })))
  }
  return {
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
    },
    tools: extraTools,
    systemPrompt: modelConfig.systemPrompt,
    options: modelConfig.options,
    modelRef: { accountId: account.id, modelId: model.id },
    secrets: [modelConfig.apiKey, ...(config.accounts ?? []).map(item => item.apiKey)]
  }
}
