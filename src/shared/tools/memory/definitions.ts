import type { ToolDefinition } from '@shared/tools/registry'

export const memoryTools = [
  {
    type: 'function',
    function: {
      name: 'memory_retrieval',
      description: 'Semantically retrieve relevant long-term facts, preferences, and historical context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search intent in English; translate before retrieval.'
          },
          chatId: {
            type: 'number',
            description: 'Restrict to this chat ID; omitted searches all chats.'
          },
          topK: {
            type: 'number',
            description: 'Result limit; default 5, max 10.'
          },
          threshold: {
            type: 'number',
            description: 'Minimum inclusive similarity, 0-1; default 0.6.'
          }
        },
        required: ['query'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_save',
      description: 'Save important facts, decisions, preferences, or context for cross-chat recall, in original and English forms.',
      parameters: {
        type: 'object',
        properties: {
          context_origin: {
            type: 'string',
            description: 'Content in its original language, preserved for display.'
          },
          context_en: {
            type: 'string',
            description: 'English content for embedding; required even when the original is English.'
          },
          chatId: {
            type: 'number',
            description: 'Associated chat ID.'
          },
          metadata: {
            type: 'object',
            description: 'Memory metadata.',
            properties: {
              category: {
                type: 'string',
                description: 'Category, e.g. preference, fact, decision, context.'
              },
              importance: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Importance level of this memory'
              },
              tags: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Tags for categorizing this memory'
              }
            }
          }
        },
        required: ['context_origin', 'context_en', 'chatId'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_update',
      description: 'Update saved memory fields by ID. Changing context_en regenerates its embedding.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The memory id to update (from memory_retrieval results).'
          },
          context_origin: {
            type: 'string',
            description: 'Updated content in original language.'
          },
          context_en: {
            type: 'string',
            description: 'Updated English translation for embedding.'
          },
          role: {
            type: 'string',
            enum: ['user', 'assistant', 'system'],
            description: 'Optional updated role for the memory.'
          },
          timestamp: {
            type: 'number',
            description: 'Optional updated timestamp (ms).'
          },
          metadata: {
            type: 'object',
            description: 'Optional updated metadata; pass null to clear.'
          }
        },
        required: ['id'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default memoryTools
