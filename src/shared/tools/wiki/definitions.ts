import type { ToolDefinition } from '@shared/tools/registry'

export const wikiTools = [
  {
    type: 'function',
    function: {
      name: 'wiki_list',
      description: 'List all wiki entries. Returns entry names, titles, types, tags, and timestamps.',
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
      name: 'wiki_read',
      description: 'Read a specific wiki entry by name. Returns the full content with frontmatter metadata.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The wiki entry name (without .md extension).'
          }
        },
        required: ['name'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wiki_write',
      description: 'Create or update a wiki entry. Content should be markdown. If no frontmatter is provided, one will be auto-generated with title, created/updated timestamps, and source set to "user".',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The wiki entry name (without .md extension). Use kebab-case (e.g. "my-wiki-entry").'
          },
          content: {
            type: 'string',
            description: 'The markdown content. May include optional YAML frontmatter delimited by "---".'
          },
          mode: {
            type: 'string',
            enum: ['upsert', 'create', 'append', 'replace'],
            default: 'upsert',
            description: 'Write mode. upsert creates or updates, create only creates new entries, append adds body content to an existing entry, and replace explicitly overwrites the target content.'
          }
        },
        required: ['name', 'content'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wiki_delete',
      description: 'Delete a wiki entry by name.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The wiki entry name (without .md extension).'
          }
        },
        required: ['name'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wiki_search',
      description: 'Semantically search wiki entries. Uses the knowledgebase index for the wiki root. Always provide both query and localized_query.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Primary search query for semantic retrieval.'
          },
          localized_query: {
            type: 'string',
            description: 'Language-matched version of the same search intent. Match the current conversation language.'
          },
          top_k: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5, max: 10).',
            default: 5
          },
          threshold: {
            type: 'number',
            description: 'Optional minimum similarity threshold between 0 and 1.'
          }
        },
        required: ['query', 'localized_query'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default wikiTools
