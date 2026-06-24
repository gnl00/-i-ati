import type { ToolDefinition } from '@shared/tools/registry'

export const historyTools = [
  {
    type: 'function',
    function: {
      name: 'history_search',
      description: 'Search recent chat history from the last 3 days by default, up to 30 days when requested. Supports title and message matching, and returns compact message windows for model context. For multiple synonyms or languages, always pass query as an array, for example ["呼和浩特", "Hohhot", "呼市"].',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Optional keyword list to search against recent chat titles and message content. Use one array item per independent keyword. When omitted, returns the most recent history windows.'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of history windows to return. Required. Recommended range: 1-8, max 10.'
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
