import type { RunToolSelection } from '@shared/run/toolSelection'
import { mcpRuntimeService } from '@main/services/mcpRuntime'
import { embeddedToolMetadata } from '@shared/tools/metadata'
import type { EmbeddedToolRequirement } from '@shared/tools/metadata-types'
import { embeddedToolsRegistry } from '@tools/registry'
import { withToolCallReasonFlatTool } from '@shared/tools/definitions-utils'

export class ToolListBuilder {
  build(extraTools: any[] | undefined, options: {
    conditions: Readonly<Record<EmbeddedToolRequirement, boolean>>
    excludedToolNames?: string[]
    selection?: RunToolSelection
  }): any[] {
    const embeddedTools = embeddedToolsRegistry.getAllTools()
    const toolsByName = new Map<string, any>()
    const excludedToolNames = new Set(options.excludedToolNames ?? [])

    if (options.selection?.webSearchEnabled === false) excludedToolNames.add('web_search')
    if (options.selection) {
      const registered = new Map(mcpRuntimeService.getRuntimeSnapshot().servers
        .filter(server => server.connected)
        .flatMap(server => server.tools)
        .map(tool => [tool.function.name, {
          ...tool.function, source: tool.source,
          serverName: tool.serverName, originalName: tool.originalName
        }]))
      const embeddedNames = new Set(embeddedTools.map(tool => tool.function.name))
      extraTools = options.selection.toolNames.flatMap(name => {
        if (embeddedNames.has(name)) return []
        const tool = registered.get(name)
        if (!tool) throw new Error(`Selected tool "${name}" is no longer available`)
        return [tool]
      })
    }

    const filteredTools = new Map<string, readonly EmbeddedToolRequirement[]>()
    const isExcluded = (name: string): boolean => {
      if (excludedToolNames.has(name)) return true
      const requires = embeddedToolMetadata[name]?.requires ?? []
      const missing = requires.filter(requirement => !options.conditions[requirement])
      if (missing.length === 0) return false
      filteredTools.set(name, missing)
      return true
    }

    for (const tool of embeddedTools) {
      const name = tool.function?.name
      if (!name || isExcluded(name)) continue
      toolsByName.set(name, withToolCallReasonFlatTool({
        ...tool.function,
        ...(tool.source ? { source: tool.source } : {})
      }))
    }

    if (Array.isArray(extraTools)) {
      for (const tool of extraTools) {
        const name = tool?.name
        if (!name || isExcluded(name)) continue
        toolsByName.set(name, withToolCallReasonFlatTool(tool))
      }
    }

    if (filteredTools.size > 0) {
      console.debug('[ToolListBuilder] Unmet tool requirements:', Object.fromEntries(filteredTools))
    }
    return Array.from(toolsByName.values())
  }
}
