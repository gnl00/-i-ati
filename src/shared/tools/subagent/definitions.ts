import type { ToolDefinition } from '@shared/tools/registry'

export const subagentTools = [
  {
    type: 'function',
    function: {
      name: 'subagent',
      description: 'Spawn background subagents for isolated research, coding, or review; wait for results/status or cancel a task.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['spawn', 'wait', 'cancel', 'inspect', 'list', 'send_message', 'followup_task', 'resume', 'interrupt'],
            description: 'spawn starts a task; wait returns status after completion or timeout without cancelling; cancel stops the target; inspect reads persisted evidence; list returns current chat tasks. send_message stores information without waking an idle child; followup_task/resume start a new run with saved context and require task/message_id, rejecting busy children. interrupt keeps history.'
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
            description: 'ID from spawn; required for wait/cancel/inspect.'
          },
          message_id: { type: 'string', description: 'Stable unique ID for send_message/followup_task/resume; reuse on retry, change for new work. Max 128 characters.' },
          message: { type: 'string', description: 'Information for send_message; max 32 KiB.' },
          run_id: { type: 'string', description: 'Optional exact run for wait/inspect/cancel/interrupt; prevents affecting a newer run.' },
          after_revision: { type: 'integer', minimum: 0, description: 'For wait, return on a newer record revision, terminal state or timeout. Pair with run_id from the previous response.' },
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
