import type { ToolDefinition } from '@shared/tools/registry'

export const historyTools = [
  {
    type: 'function',
    function: {
      name: 'history_search',
      description: 'Search recent chat history from the last 3 days by default, up to 7 days when requested. Supports title and message matching, and returns compact message windows for model context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional text query to search against recent chat titles and message content. When omitted, returns the most recent history windows.'
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
            description: 'Recency window in days. Defaults to 3, max 7.'
          }
        },
        required: ['limit'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default historyTools
