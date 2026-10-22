import type { ToolDefinition } from '@shared/tools/registry'

export const scheduleTools = [
  {
    type: 'function',
    function: {
      name: 'schedule',
      description: 'Manage one-time/recurring tasks. Each execution starts in an empty chat: create/update payload.prompt must name the target, constraints, outputs, and required paths.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'list', 'cancel', 'update'],
            description: 'list returns this chat\'s schedules; update changes a pending schedule.'
          },
          id: {
            type: 'string',
            description: 'Required for cancel/update.'
          },
          goal: {
            type: 'string',
            description: 'Required for create; replacement goal for update.'
          },
          run_at: {
            type: 'string',
            description: 'One-time create/update: ISO-8601 datetime with offset.'
          },
          cron_expression: {
            type: 'string',
            description: 'Recurring create/update: 5-field cron (minute hour day-of-month month day-of-week).'
          },
          timezone: {
            type: 'string',
            description: 'IANA timezone; required for recurring create, accepted for recurring update.'
          },
          plan_id: {
            type: 'string',
            description: 'Plan ID for create.'
          },
          payload: {
            type: 'object',
            description: 'create/update: standalone prompt and optional modelRef. No source history, summaries, attachments, skills, fork metadata, or host bindings are inherited.'
          },
          max_attempts: {
            type: 'integer',
            minimum: 1,
            description: 'Attempts per occurrence for create/update.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default scheduleTools
