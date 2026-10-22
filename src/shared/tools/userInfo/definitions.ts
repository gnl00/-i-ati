import type { ToolDefinition } from '@shared/tools/registry'

export const userInfoTools = [
  {
    type: 'function',
    function: {
      name: 'user_info',
      description: 'Read or replace the persisted global profile used in prompts.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set'],
            description: 'get reads; set replaces the full profile.'
          },
          name: {
            type: 'string',
            description: 'The user’s real name if known.'
          },
          preferredAddress: {
            type: 'string',
            description: 'How the user prefers to be addressed.'
          },
          basicInfo: {
            type: 'string',
            description: 'Concise stable background information about the user.'
          },
          preferences: {
            type: 'string',
            description: 'Concise stable preferences, interests, or communication preferences.'
          }
        },
        additionalProperties: false,
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default userInfoTools
