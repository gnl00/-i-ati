import type { ToolDefinition } from '@shared/tools/registry'

export const GENERATE_SMART_MESSAGES_TOOL_NAME = 'generate_smart_messages'

export const generateSmartMessagesTool = {
  type: 'function',
  function: {
    name: GENERATE_SMART_MESSAGES_TOOL_NAME,
    description: 'Return Smart message suggestions generated from compressed summaries.',
    parameters: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Smart message suggestions generated from recent compressed summaries.',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Short label for the welcome suggestion.'
              },
              body: {
                type: 'string',
                description: 'One concise sentence shown in the Smart welcome card.'
              },
              actionPrompt: {
                type: 'string',
                description: 'Concrete prompt inserted into the chat input when selected.'
              },
              reason: {
                type: 'string',
                description: 'Brief rationale based on the compressed summaries.'
              },
              priorityScore: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Relevance score from 0 to 1.'
              }
            },
            required: ['title', 'body', 'actionPrompt', 'priorityScore'],
            additionalProperties: false
          }
        }
      },
      required: ['messages'],
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#'
    }
  }
} satisfies ToolDefinition
