import type { ToolDefinition } from '@shared/tools/registry'

export default [
  {
    type: 'function',
    function: {
      name: 'get_soul',
      description: 'Read the current agent soul markdown that shapes tone, values, and collaboration style.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_soul',
      description: 'Replace the current agent soul markdown. Use this only for tone, values, working style, and collaboration style updates.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The full new soul markdown content.'
          },
          reason: {
            type: 'string',
            description: 'Why this soul update is being made.'
          }
        },
        additionalProperties: false,
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reset_soul',
      description: 'Reset the current agent soul to the built-in default.',
      parameters: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm the reset.'
          }
        },
        additionalProperties: false,
        required: ['confirm']
      }
    }
  }
] satisfies ToolDefinition[]
