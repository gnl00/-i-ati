import type { ToolDefinition } from '@shared/tools/registry'

export const registryTools = [
  {
    type: 'function',
    function: {
      name: 'list_tools',
      description: 'List all available external tools with their names and descriptions. Use this to discover what external tools are available before using search_tools to get their full definitions.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_tools',
      description: 'Search for tools by their names and get their complete definitions. Use this to discover and load tool definitions on-demand instead of loading all tools upfront.',
      parameters: {
        type: 'object',
        properties: {
          tool_names: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Array of tool names to search for. Returns the complete tool definitions for the specified tools.'
          }
        },
        required: ['tool_names'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default registryTools
