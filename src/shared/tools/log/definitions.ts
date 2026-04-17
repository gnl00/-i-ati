import type { ToolDefinition } from '@shared/tools/registry'

export const logTools = [
  {
    type: 'function',
    function: {
      name: 'log_search',
      description: 'Inspect app or perf log files for a specific date. Return the latest lines when no filters are provided, or matched blocks around query and scope hits.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['app', 'perf'],
            description: 'Which log stream to inspect.'
          },
          date: {
            type: 'string',
            description: "Optional log date in YYYY-MM-DD format. When omitted, inspect today's log."
          },
          query: {
            type: 'string',
            description: 'Optional fuzzy text match against each raw log line.'
          },
          scope: {
            type: 'string',
            description: 'Optional fuzzy match against the structured log scope field, with raw-line fallback for non-JSON logs.'
          },
          tail_lines: {
            type: 'number',
            description: 'When query and scope are empty, return the last N lines. Defaults to 200, max 1000.',
            default: 200
          },
          context_before: {
            type: 'number',
            description: 'How many lines to include before each match. Defaults to 10, max 50.',
            default: 10
          },
          context_after: {
            type: 'number',
            description: 'How many lines to include after each match. Defaults to 20, max 50.',
            default: 20
          },
          max_matches: {
            type: 'number',
            description: 'Maximum number of matches to include before block merging. Defaults to 20, max 50.',
            default: 20
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Whether query and scope matching should be case-sensitive. Defaults to false.',
            default: false
          }
        },
        required: ['target'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default logTools
