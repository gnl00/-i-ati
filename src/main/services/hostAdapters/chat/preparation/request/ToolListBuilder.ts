import { embeddedToolsRegistry } from '@tools/registry'

export class ToolListBuilder {
  build(extraTools?: any[]): any[] {
    const toolsByName = new Map<string, any>()

    for (const tool of embeddedToolsRegistry.getAllTools()) {
      const name = tool.function?.name
      if (!name) continue
      toolsByName.set(name, { ...tool.function })
    }

    if (Array.isArray(extraTools)) {
      for (const tool of extraTools) {
        const name = tool?.name
        if (!name) continue
        toolsByName.set(name, tool)
      }
    }

    return Array.from(toolsByName.values())
  }
}
