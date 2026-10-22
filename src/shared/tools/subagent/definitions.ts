import type { ToolDefinition } from '@shared/tools/registry'

export const subagentTools = [
  {
    type: 'function',
    function: {
      name: 'subagent',
      description: 'Spawn background subagents for isolated research, coding, or review; wait for results/status.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['spawn', 'wait'],
            description: 'spawn starts a task; wait blocks until completion or timeout, returning status.'
          },
          task: {
            type: 'string',
            description: 'Self-contained task; required for spawn.'
          },
          role: {
            type: 'string',
            description: 'Role hint: general, researcher, coder, reviewer.'
          },
          context_mode: {
            type: 'string',
            enum: ['minimal', 'current_chat_summary'],
            description: 'How much parent-chat context to include. Defaults to current_chat_summary.'
          },
          files: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'File paths to inspect first.'
          },
          background: {
            type: 'boolean',
            description: 'Currently always runs in background.'
          },
          subagent_id: {
            type: 'string',
            description: 'ID from spawn; required for wait.'
          },
          timeout_seconds: {
            type: 'number',
            description: 'Seconds to wait before returning status; default 30.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default subagentTools
