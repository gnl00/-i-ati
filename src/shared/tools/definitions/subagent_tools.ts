export default [
  {
    type: 'function',
    function: {
      name: 'subagent_spawn',
      description: 'Spawn a background subagent for isolated research, coding, or review work. Use this when a bounded subtask can proceed independently and later be collected with subagent_wait.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Clear, self-contained task for the subagent to execute.'
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
          }
        },
        required: ['task'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'subagent_wait',
      description: 'Wait for a previously spawned subagent to finish, or poll its current status if it is still running.',
      parameters: {
        type: 'object',
        properties: {
          subagent_id: {
            type: 'string',
            description: 'Identifier returned by subagent_spawn.'
          },
          timeout_seconds: {
            type: 'number',
            description: 'Optional maximum time to wait before returning the current status. Defaults to 30 seconds.'
          }
        },
        required: ['subagent_id'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
]
