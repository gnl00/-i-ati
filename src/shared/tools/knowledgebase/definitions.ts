import type { ToolDefinition } from '@shared/tools/registry'

export const knowledgebaseTools = [
  {
    type: 'function',
    function: {
      name: 'knowledgebase_search',
      description: 'Search indexed local knowledgebase chunks from configured folders. Always provide both query and localized_query. query carries the main search intent. localized_query carries the same intent in the current conversation language for language-matched retrieval.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Primary search query for semantic retrieval.'
          },
          localized_query: {
            type: 'string',
            description: 'Language-matched version of the same search intent. Use Chinese in Chinese conversations, English in English conversations, and always match the current user language environment.'
          },
          top_k: {
            type: 'number',
            description: 'Maximum results to return. Defaults to 5, max 10.',
            default: 5
          },
          threshold: {
            type: 'number',
            description: 'Optional minimum similarity threshold between 0 and 1.'
          },
          folders: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional subset of configured knowledgebase folders to search.'
          },
          extensions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional file extensions to limit retrieval, such as [".md", ".ts"].'
          }
        },
        required: ['query', 'localized_query'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default knowledgebaseTools
