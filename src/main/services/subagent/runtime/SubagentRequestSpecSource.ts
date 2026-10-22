import type { AgentRequestSpec } from '@main/agent/runtime/request/AgentRequestSpec'
import type { AgentRequestSpecSource } from '@main/agent/runtime/AgentRuntimeContext'
import type { AgentRuntimeRunInput } from '@main/agent/runtime/AgentRuntimeRunInput'
import type { RunSpec } from '@main/agent/contracts'
import { embeddedToolsRegistry } from '@tools/registry'

export interface SubagentRequestSpecSourceOptions {
  modelContext?: RunSpec['modelContext']
  requestSpec?: AgentRequestSpec
  systemPrompt: string
  allowedTools: string[]
}

const buildAllowedTools = (
  allowedToolNames: string[]
): Array<{ name: string; description: string; parameters: any }> =>
  allowedToolNames
    .map((toolName) => embeddedToolsRegistry.getTool(toolName))
    .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool))
    .map((tool) => ({ ...tool.function }))

export class SubagentRequestSpecSource implements AgentRequestSpecSource {
  constructor(private readonly options: SubagentRequestSpecSourceOptions) {}

  resolve(_input: AgentRuntimeRunInput): AgentRequestSpec {
    if (this.options.requestSpec) {
      return {
        ...this.options.requestSpec,
        systemPrompt: this.options.systemPrompt,
        systemPromptParts: { workerPolicy: { characters: this.options.systemPrompt.length, utf8Bytes: Buffer.byteLength(this.options.systemPrompt) } },
        tools: buildAllowedTools(this.options.allowedTools)
      }
    }
    if (!this.options.modelContext) throw new Error('Subagent model context is unavailable.')
    return {
      adapterPluginId: this.options.modelContext.providerDefinition.adapterPluginId,
      baseUrl: this.options.modelContext.account.apiUrl,
      apiKey: this.options.modelContext.account.apiKey,
      model: this.options.modelContext.model.id,
      contextWindowTokens: this.options.modelContext.model.contextWindowTokens,
      modelType: this.options.modelContext.model.type,
      systemPrompt: this.options.systemPrompt,
      systemPromptParts: { workerPolicy: { characters: this.options.systemPrompt.length, utf8Bytes: Buffer.byteLength(this.options.systemPrompt) } },
      stream: true,
      tools: buildAllowedTools(this.options.allowedTools),
      payloadExtensions: this.options.modelContext.providerDefinition.payloadExtensions,
      requestOverrides: this.options.modelContext.providerDefinition.requestOverrides
    }
  }
}
