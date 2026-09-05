import type { ToolDefinition } from '@shared/tools/registry'

export const scheduleTools = [
  {
    type: 'function',
    function: {
      name: 'schedule',
      description: 'Manage one-time and recurring scheduled tasks. Each scheduled execution runs in a fresh empty chat, so create and update payload.prompt as a self-contained instruction that names the execution object, constraints, output requirements, and required paths. Set action to create, list, cancel, or update; the processor validates action-specific fields and schedule timing rules.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'list', 'cancel', 'update'],
            description: 'Operation to perform: create adds a schedule, list retrieves schedules for this chat, cancel stops a schedule, and update changes a pending schedule.'
          },
          id: {
            type: 'string',
            description: 'Scheduled task id. Required for action=cancel and action=update.'
          },
          goal: {
            type: 'string',
            description: 'Goal of the scheduled task. Required for action=create; optional replacement for action=update.'
          },
          run_at: {
            type: 'string',
            description: 'One-time ISO-8601 datetime with offset for action=create or an update to a one-time schedule.'
          },
          cron_expression: {
            type: 'string',
            description: 'Recurring 5-field cron for action=create or an update to a recurring schedule: minute hour day-of-month month day-of-week.'
          },
          timezone: {
            type: 'string',
            description: 'IANA timezone required for recurring action=create schedules and accepted for recurring action=update schedules.'
          },
          plan_id: {
            type: 'string',
            description: 'Optional task plan id for action=create.'
          },
          payload: {
            type: 'object',
            description: 'Optional scheduler payload for action=create or action=update. Include prompt as a complete standalone instruction; modelRef may select the execution model. The prompt runs without source chat history, summaries, attachments, skills, fork metadata, or host bindings.'
          },
          max_attempts: {
            type: 'integer',
            minimum: 1,
            description: 'Maximum attempts for each occurrence for action=create or action=update; minimum 1.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default scheduleTools
