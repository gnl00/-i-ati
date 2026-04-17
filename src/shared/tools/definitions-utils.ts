import type { ToolDefinition } from './registry'

export function mergeToolDefinitions(...groups: ToolDefinition[][]): ToolDefinition[] {
  const merged: ToolDefinition[] = []
  const seenToolNames = new Set<string>()

  groups.forEach(group => {
    group.forEach(tool => {
      const toolName = tool.function.name
      if (seenToolNames.has(toolName)) {
        throw new Error(`Duplicate tool definition: ${toolName}`)
      }
      seenToolNames.add(toolName)
      merged.push(tool)
    })
  })

  return merged
}
