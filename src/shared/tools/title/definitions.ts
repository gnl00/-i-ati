import type { ToolDefinition } from '@shared/tools/registry'

export const titleTools = [
  {
    type: 'function',
    function: {
      name: 'chat_set_title',
      description: 'Set a concise, descriptive title for this conversation. Call when the conversation topic is sufficiently clear. Chinese titles should be ≤18 characters, English ≤12 words. Prefer noun phrases or task phrases.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Concise title for this conversation. Use a noun phrase or task phrase that summarizes the topic.'
          },
          chat_uuid: {
            type: 'string',
            description: 'UUID of the chat conversation whose title should be updated.'
          }
        },
        required: ['title', 'chat_uuid'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default titleTools
