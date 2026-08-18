import { embeddedToolsRegistry } from '@tools/registry'
import { withToolCallReasonFlatTool } from '@shared/tools/definitions-utils'

export class ToolListBuilder {
  build(extraTools?: any[], options: { excludedToolNames?: string[] } = {}): any[] {
    const toolsByName = new Map<string, any>()
    const excludedToolNames = new Set(options.excludedToolNames ?? [])

    for (const tool of embeddedToolsRegistry.getAllTools()) {
      const name = tool.function?.name
      if (!name || excludedToolNames.has(name)) continue
      toolsByName.set(name, withToolCallReasonFlatTool({
        ...tool.function,
        ...(tool.source ? { source: tool.source } : {})
      }))
    }

    if (Array.isArray(extraTools)) {
      for (const tool of extraTools) {
        const name = tool?.name
        if (!name || excludedToolNames.has(name)) continue
        toolsByName.set(name, withToolCallReasonFlatTool(tool))
      }
    }

    return Array.from(toolsByName.values())
  }
}
