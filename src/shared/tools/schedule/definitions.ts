import type { ToolDefinition } from '@shared/tools/registry'

export const scheduleTools = [
  {
    type: 'function',
    function: {
      name: 'schedule_create',
      description: 'Create a one-time or recurring scheduled task for a chat. Cron uses standard 5-field minute precision and an IANA timezone.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Goal of the scheduled task.' },
          run_at: { type: 'string', description: 'One-time ISO-8601 datetime with offset.' },
          cron_expression: { type: 'string', description: 'Recurring 5-field cron: minute hour day-of-month month day-of-week.' },
          timezone: { type: 'string', description: 'IANA timezone required for recurring schedules.' },
          plan_id: { type: 'string', description: 'Optional task plan id.' },
          payload: { type: 'object', description: 'Optional scheduler payload.' },
          max_attempts: { type: 'integer', minimum: 1, description: 'Maximum attempts for each occurrence; minimum 1.' }
        },
        required: ['goal'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_list',
      description: 'List scheduled tasks for a chat.',
      parameters: { type: 'object', properties: {}, required: [], $schema: 'http://json-schema.org/draft-07/schema#' }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_cancel',
      description: 'Cancel a pending or running scheduled task and its active occurrence.',
      parameters: { type: 'object', properties: { id: { type: 'string', description: 'Scheduled task id.' } }, required: ['id'], $schema: 'http://json-schema.org/draft-07/schema#' }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_update',
      description: 'Update a pending schedule within its existing once or cron type.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Scheduled task id.' },
          goal: { type: 'string', description: 'New goal.' },
          run_at: { type: 'string', description: 'New one-time ISO-8601 datetime.' },
          cron_expression: { type: 'string', description: 'New recurring 5-field cron expression.' },
          timezone: { type: 'string', description: 'New IANA timezone for a recurring schedule.' },
          payload: { type: 'object', description: 'Optional payload update.' },
          max_attempts: { type: 'integer', minimum: 1, description: 'Maximum attempts for each occurrence; minimum 1.' }
        },
        required: ['id'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default scheduleTools
