import type { ToolDefinition } from './registry'

export const TOOL_CALL_REASON_PARAMETER_NAME = 'tool_call_reason'

const TOOL_CALL_REASON_PARAMETER_SCHEMA = {
  type: 'string',
  description: 'Brief reason for choosing this tool now. Write this field in the same language the user is currently using, and state the intended observable outcome in one sentence.'
}

const isObjectSchema = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

export function withToolCallReasonParameters(parameters: any): any {
  const base = isObjectSchema(parameters) ? parameters : {}
  const properties = isObjectSchema(base.properties) ? base.properties : {}
  const required = Array.isArray(base.required) ? base.required : []

  return {
    ...base,
    type: 'object',
    properties: {
      ...properties,
      [TOOL_CALL_REASON_PARAMETER_NAME]:
        properties[TOOL_CALL_REASON_PARAMETER_NAME] ?? TOOL_CALL_REASON_PARAMETER_SCHEMA
    },
    required: required.includes(TOOL_CALL_REASON_PARAMETER_NAME)
      ? required
      : [...required, TOOL_CALL_REASON_PARAMETER_NAME]
  }
}

export function withToolCallReasonDefinition<T extends ToolDefinition>(tool: T): T {
  return {
    ...tool,
    function: {
      ...tool.function,
      parameters: withToolCallReasonParameters(tool.function.parameters)
    }
  }
}

export function withToolCallReasonFlatTool<T extends { parameters?: any; inputSchema?: any }>(tool: T): T {
  const parameters = withToolCallReasonParameters(tool.parameters ?? tool.inputSchema)
  return {
    ...tool,
    parameters
  }
}

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
      merged.push(withToolCallReasonDefinition(tool))
    })
  })

  return merged
}
