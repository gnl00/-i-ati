import type { ToolDefinition } from '@shared/tools/registry'

export const subagentTools = [
  {
    type: 'function',
    function: {
      name: 'subagent',
      description: 'Spawn background subagents for isolated research, coding, or review work, and wait for their results. Set action to spawn to start a background task or wait to block until a previously spawned subagent finishes (or returns its current status).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['spawn', 'wait'],
            description: 'Operation to perform: spawn creates and starts a background subagent, wait blocks for a spawned subagent to finish or returns its current status.'
          },
          task: {
            type: 'string',
            description: 'Clear, self-contained task for the subagent to execute. Required for action=spawn.'
          },
          role: {
            type: 'string',
            description: 'Optional subagent role hint. Built-in examples: general, researcher, coder, reviewer.'
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
            description: 'Optional file path hints the subagent should inspect first.'
          },
          background: {
            type: 'boolean',
            description: 'Whether to run in the background. Phase one always runs background tasks.'
          },
          subagent_id: {
            type: 'string',
            description: 'Identifier returned by action=spawn. Required for action=wait.'
          },
          timeout_seconds: {
            type: 'number',
            description: 'Optional maximum time to wait before returning the current status. Defaults to 30 seconds.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default subagentTools
