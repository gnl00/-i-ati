import type { ToolDefinition } from '@shared/tools/registry'

export const historyTools = [
  {
    type: 'function',
    function: {
      name: 'history_search',
      description: 'Search recent chat titles/messages and return compact windows. For synonyms or multiple languages pass query as an array.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'One independent keyword per item; omitted returns latest windows.'
          },
          limit: {
            type: 'number',
            description: 'Window limit; recommended 1-8, max 10.'
          },
          scope: {
            type: 'string',
            enum: ['all', 'current_chat'],
            description: 'Whether to search across all chats or only the current chat.'
          },
          withinDays: {
            type: 'number',
            description: 'Recency window in days. Defaults to 3, max 30.'
          }
        },
        required: ['limit'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default historyTools
