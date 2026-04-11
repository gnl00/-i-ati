import type { AgentRequestSpec } from '@main/services/next/request/AgentRequestSpec'
import type { AgentRequestSpecSource } from '@main/services/next/runtime/NextAgentRuntimeContext'
import type { NextAgentRuntimeRunInput } from '@main/services/next/runtime/NextAgentRuntimeRunInput'
import type { RunSpec } from '@main/services/agent/contracts'
import { embeddedToolsRegistry } from '@tools/registry'

export interface SubagentRequestSpecSourceOptions {
  modelContext: RunSpec['modelContext']
  systemPrompt: string
  allowedTools: string[]
}

const buildAllowedTools = (allowedToolNames: string[]): Array<{ name: string; description: string; parameters: any }> => (
  allowedToolNames
    .map((toolName) => embeddedToolsRegistry.getTool(toolName))
    .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool))
    .map((tool) => ({ ...tool.function }))
)

export class SubagentRequestSpecSource implements AgentRequestSpecSource {
  constructor(private readonly options: SubagentRequestSpecSourceOptions) {}

  resolve(_input: NextAgentRuntimeRunInput): AgentRequestSpec {
    return {
      adapterPluginId: this.options.modelContext.providerDefinition.adapterPluginId,
      baseUrl: this.options.modelContext.account.apiUrl,
      apiKey: this.options.modelContext.account.apiKey,
      model: this.options.modelContext.model.id,
      modelType: this.options.modelContext.model.type,
      systemPrompt: this.options.systemPrompt,
      stream: true,
      tools: buildAllowedTools(this.options.allowedTools),
      requestOverrides: this.options.modelContext.providerDefinition.requestOverrides
    }
  }
}
