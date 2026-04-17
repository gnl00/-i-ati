import type { ToolDefinition } from '@shared/tools/registry'

export const workContextTools = [
  {
    type: 'function',
    function: {
      name: 'work_context_get',
      description: 'Get the current work context markdown for this chat. Use this for short-term, high-frequency context such as current goal, decisions, in-progress items, open questions, and temporary constraints.',
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
      name: 'work_context_set',
      description: 'Set (replace) the current work context markdown for this chat. Write concise, structured markdown and keep sections up to date as the conversation progresses.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Complete markdown content to store as the current work context.'
          }
        },
        required: ['content'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default workContextTools
