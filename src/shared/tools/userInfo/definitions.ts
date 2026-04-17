import type { ToolDefinition } from '@shared/tools/registry'

export const userInfoTools = [
  {
    type: 'function',
    function: {
      name: 'user_info_get',
      description: 'Get the persisted global user profile information used for prompt injection, including name, preferred address, basic info, and stable preferences.',
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
      name: 'user_info_set',
      description: 'Replace the full persisted global user profile information. Send the complete best-known profile, not a patch. Use this after you learn or update the user’s stable name, preferred address, basic info, or preferences.',
      parameters: {
        type: 'object',
        properties: {
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
        required: [],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default userInfoTools
