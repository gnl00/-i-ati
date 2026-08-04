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
      description: 'Manage task plans. Set action to create, update, update_status, get_by_id, get_current_chat, delete, or step_upsert; the processor validates action-specific fields.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'update_status', 'get_by_id', 'get_current_chat', 'delete', 'step_upsert'],
            description: 'Operation to perform: create makes a plan, update changes a plan, update_status changes plan or step status, get_by_id retrieves one plan, get_current_chat retrieves plans for this chat, delete removes a plan, and step_upsert creates or updates one step.'
          },
          goal: {
            type: 'string',
            description: 'Goal for action=create. Required when creating a plan.'
          },
          context: {
            type: 'object',
            description: 'Relevant context for action=create.'
          },
          constraints: {
            ...constraintsSchema,
            description: 'Plan constraints for action=create.'
          },
          steps: {
            type: 'array',
            items: planStepSchema,
            description: 'Plan steps for action=create. Required when creating a plan.'
          },
          plan: {
            ...planSchema,
            description: 'Partial plan update for action=update. plan.id is required.'
          },
          id: {
            type: 'string',
            description: 'Plan id for action=update_status, action=get_by_id, and action=delete.'
          },
          status: {
            ...planStatusSchema,
            description: 'New plan status for action=update_status. Required with id.'
          },
          currentStepId: {
            type: 'string',
            description: 'Optional current step id for action=update_status.'
          },
          failureReason: {
            type: 'string',
            description: 'Optional failure reason for action=update_status.'
          },
          stepId: {
            type: 'string',
            description: 'Optional step id for action=update_status when changing a step.'
          },
          stepStatus: {
            ...planStepStatusSchema,
            description: 'Optional step status for action=update_status. stepId is required when stepStatus is provided.'
          },
          planId: {
            type: 'string',
            description: 'Plan id for action=step_upsert. Required when upserting a step.'
          },
          step: {
            ...planStepSchema,
            description: 'Step payload for action=step_upsert. Required when upserting a step.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default planTools
