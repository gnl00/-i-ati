import { embeddedToolMetadata } from '@shared/tools/metadata'
import type { EmbeddedToolRequirement } from '@shared/tools/metadata-types'
import { embeddedToolsRegistry } from '@tools/registry'
import { withToolCallReasonFlatTool } from '@shared/tools/definitions-utils'

export class ToolListBuilder {
  build(extraTools: any[] | undefined, options: {
    conditions: Readonly<Record<EmbeddedToolRequirement, boolean>>
    excludedToolNames?: string[]
  }): any[] {
    const toolsByName = new Map<string, any>()
    const excludedToolNames = new Set(options.excludedToolNames ?? [])

    const filteredTools = new Map<string, readonly EmbeddedToolRequirement[]>()
    const isExcluded = (name: string): boolean => {
      if (excludedToolNames.has(name)) return true
      const requires = embeddedToolMetadata[name]?.requires ?? []
      const missing = requires.filter(requirement => !options.conditions[requirement])
      if (missing.length === 0) return false
      filteredTools.set(name, missing)
      return true
    }

    for (const tool of embeddedToolsRegistry.getAllTools()) {
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
