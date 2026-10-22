import type { ToolDefinition } from '@shared/tools/registry'

export const soulTools = [
  {
    type: 'function',
    function: {
      name: 'soul',
      description: 'Manage persisted Soul Markdown: tone, values, and collaboration style.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'edit', 'reset'],
            description: 'get reads; edit replaces full Markdown; reset restores the built-in default.'
          },
          content: {
            type: 'string',
            description: 'Complete new Markdown; required for edit.'
          },
          reason: {
            type: 'string',
            description: 'Reason for edit.'
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true for reset.'
          }
        },
        additionalProperties: false,
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default soulTools
