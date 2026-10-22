import type { ToolDefinition } from '@shared/tools/registry'

const planStatusSchema = {
  type: 'string',
  enum: ['pending', 'pending_review', 'running', 'paused', 'completed', 'failed', 'cancelled']
}

const planStepStatusSchema = {
  type: 'string',
  enum: ['todo', 'doing', 'done', 'failed', 'skipped']
}

const constraintsSchema = {
  type: 'object',
  properties: {
    maxSteps: {
      type: 'number',
      description: 'Maximum number of steps.'
    },
    timeout: {
      type: 'string',
      description: "Timeout duration, e.g. '1 hour'."
    },
    parallelize: {
      type: 'array',
      items: { type: 'string' },
      description: 'Step IDs that can run in parallel.'
    }
  }
}

const planStepSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    status: planStepStatusSchema,
    dependsOn: {
      type: 'array',
      items: { type: 'string' }
    },
    tool: { type: 'string' },
    input: { type: 'object' },
    output: {},
    error: { type: 'string' },
    notes: { type: 'string' }
  },
  required: ['id', 'title', 'status']
}

const planSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    chatUuid: { type: 'string' },
    goal: { type: 'string' },
    context: { type: 'object' },
    constraints: constraintsSchema,
    status: planStatusSchema,
    currentStepId: { type: 'string' },
    failureReason: { type: 'string' },
    steps: {
      type: 'array',
      items: planStepSchema
    }
  },
  required: ['id']
}

export const planTools = [
  {
    type: 'function',
    function: {
      name: 'plan',
      description: 'Manage task plans and steps; action-specific fields are validated at execution.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'update_status', 'get_by_id', 'get_current_chat', 'delete', 'step_upsert'],
            description: 'get_current_chat lists this chat\'s plans; update_status changes plan/step status; step_upsert creates or updates a step.'
          },
          goal: {
            type: 'string',
            description: 'Required for create.'
          },
          context: {
            type: 'object',
            description: 'Context for create.'
          },
          constraints: {
            ...constraintsSchema,
            description: 'Constraints for create.'
          },
          steps: {
            type: 'array',
            items: planStepSchema,
            description: 'Required for create.'
          },
          plan: {
            ...planSchema,
            description: 'Partial update for update; plan.id required.'
          },
          id: {
            type: 'string',
            description: 'Plan ID for update_status, get_by_id, delete.'
          },
          status: {
            ...planStatusSchema,
            description: 'Required with id for update_status.'
          },
          currentStepId: {
            type: 'string',
            description: 'Current step ID for update_status.'
          },
          failureReason: {
            type: 'string',
            description: 'Failure reason for update_status.'
          },
          stepId: {
            type: 'string',
            description: 'Step ID for update_status; required with stepStatus.'
          },
          stepStatus: {
            ...planStepStatusSchema,
            description: 'Step status for update_status; requires stepId.'
          },
          planId: {
            type: 'string',
            description: 'Required for step_upsert.'
          },
          step: {
            ...planStepSchema,
            description: 'Required for step_upsert.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default planTools
