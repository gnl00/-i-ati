import type { ToolDefinition } from '@shared/tools/registry'

export const webTools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Discover sources with a web search and return titles, snippets, and links. Search results contain excerpts, not page bodies. Select relevant URLs and use web_fetch to read their content when more evidence is needed.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to perform on the web.'
          },
          engine: {
            type: 'string',
            description: 'Search engine to use. Defaults to bing. Use duckduckgo as an independent alternative when another engine is degraded or blocked.',
            enum: ['bing', 'google', 'duckduckgo']
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
      name: 'web_fetch',
      description: 'Fetch content from a specified URL. Small text is returned inline. Large text and fetched files are saved directly to .tmp/web-fetch/*.tmp with a file path, MIME, and a bounded summary. Inspect source files with a suitable workspace file-reading tool.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch content from. Must be a fully-formed valid URL.'
          },
          cleanMode: {
            type: 'string',
            description: 'Content cleaning mode: lite (shorter, more aggressive) or full (more structure).',
            enum: ['lite', 'full']
          }
        },
        required: ['url'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default webTools
