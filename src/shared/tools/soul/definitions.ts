import type { ToolDefinition } from '@shared/tools/registry'

export const soulTools = [
  {
    type: 'function',
    function: {
      name: 'soul',
      description: 'Manage the persisted agent soul markdown that shapes tone, values, and collaboration style. Set action to get, edit, or reset; the processor validates action-specific fields.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'edit', 'reset'],
            description: 'Operation to perform: get retrieves the current soul, edit replaces the full soul markdown, reset restores the built-in default.'
          },
          content: {
            type: 'string',
            description: 'The full new soul markdown content. Required for action=edit.'
          },
          reason: {
            type: 'string',
            description: 'Why this soul update is being made for action=edit.'
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm the reset for action=reset.'
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
