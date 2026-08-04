import type { ToolDefinition } from '@shared/tools/registry'

export const wikiTools = [
  {
    type: 'function',
    function: {
      name: 'wiki',
      description: 'Manage local Markdown wiki entries. Use action to list, read, write, delete, or semantically search entries.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'read', 'write', 'delete', 'search'],
            description: 'Wiki operation to perform.'
          },
          name: {
            type: 'string',
            description: 'Wiki entry name without the .md extension.'
          },
          content: {
            type: 'string',
            description: 'Markdown content for write. Optional YAML frontmatter is supported.'
          },
          mode: {
            type: 'string',
            enum: ['upsert', 'create', 'append', 'replace'],
            default: 'upsert',
            description: 'Write mode for action write.'
          },
          query: {
            type: 'string',
            description: 'Primary semantic query for action search.'
          },
          localized_query: {
            type: 'string',
            description: 'Language-matched query for action search.'
          },
          top_k: {
            type: 'number',
            description: 'Maximum search results for action search (default: 5, max: 10).',
            default: 5
          },
          threshold: {
            type: 'number',
            description: 'Optional search similarity threshold between 0 and 1.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default wikiTools
