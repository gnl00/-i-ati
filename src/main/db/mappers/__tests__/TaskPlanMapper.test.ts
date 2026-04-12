import { describe, expect, it } from 'vitest'
import type { Plan } from '@shared/task-planner/schemas'
import {
  toTaskPlanEntity,
  toTaskPlanRow,
  toTaskPlanStepRow,
  toTaskPlanStepStatusOutput
} from '../TaskPlanMapper'

describe('TaskPlanMapper', () => {
  it('maps a plan into db rows', () => {
    const plan: Plan = {
      id: 'plan-1',
      chatUuid: 'chat-1',
      goal: 'Ship cleanup',
      context: { branch: 'main' },
      constraints: { maxSteps: 4, parallelize: ['step-2'] },
      status: 'running',
      currentStepId: 'step-1',
      failureReason: undefined,
      createdAt: 100,
      updatedAt: 200,
      steps: [
        {
          id: 'step-1',
          title: 'Inspect',
          status: 'doing',
          dependsOn: ['seed'],
          tool: 'rg',
          input: { q: 'task plan' },
          output: { matches: 3 },
          notes: 'first pass'
        }
      ]
    }

    expect(toTaskPlanRow(plan)).toEqual({
      id: 'plan-1',
      chat_uuid: 'chat-1',
      goal: 'Ship cleanup',
      context: JSON.stringify({ branch: 'main' }),
      constraints: JSON.stringify({ maxSteps: 4, parallelize: ['step-2'] }),
      status: 'running',
      current_step_id: 'step-1',
      failure_reason: null,
      created_at: 100,
      updated_at: 200
    })

    expect(toTaskPlanStepRow('plan-1', plan.steps[0], 999, {
      created_at: 100,
      updated_at: 200
    })).toEqual({
      id: 'step-1',
      plan_id: 'plan-1',
      title: 'Inspect',
      status: 'doing',
      depends_on: JSON.stringify(['seed']),
      tool: 'rg',
      input: JSON.stringify({ q: 'task plan' }),
      output: JSON.stringify({ matches: 3 }),
      error: null,
      notes: 'first pass',
      created_at: 100,
      updated_at: 200
    })
  })

  it('maps db rows back into a plan entity', () => {
    const plan = toTaskPlanEntity(
      {
        id: 'plan-1',
        chat_uuid: 'chat-1',
        goal: 'Ship cleanup',
        context: JSON.stringify({ branch: 'main' }),
        constraints: JSON.stringify({ timeout: '1 hour' }),
        status: 'pending_review',
        current_step_id: 'step-2',
        failure_reason: 'needs approval',
        created_at: 100,
        updated_at: 200
      },
      [
        {
          id: 'step-1',
          plan_id: 'plan-1',
          title: 'Inspect',
          status: 'done',
          depends_on: null,
          tool: 'rg',
          input: JSON.stringify({ q: 'task plan' }),
          output: JSON.stringify({ matches: 3 }),
          error: null,
          notes: null,
          created_at: 100,
          updated_at: 150
        }
      ]
    )

    expect(plan).toEqual({
      id: 'plan-1',
      chatUuid: 'chat-1',
      goal: 'Ship cleanup',
      context: { branch: 'main' },
      constraints: { timeout: '1 hour' },
      status: 'pending_review',
      currentStepId: 'step-2',
      failureReason: 'needs approval',
      createdAt: 100,
      updatedAt: 200,
      steps: [
        {
          id: 'step-1',
          title: 'Inspect',
          status: 'done',
          dependsOn: undefined,
          tool: 'rg',
          input: { q: 'task plan' },
          output: { matches: 3 },
          error: undefined,
          notes: undefined
        }
      ]
    })
  })

  it('serializes step status output consistently', () => {
    expect(toTaskPlanStepStatusOutput(undefined)).toBeNull()
    expect(toTaskPlanStepStatusOutput({ ok: true })).toBe(JSON.stringify({ ok: true }))
    expect(toTaskPlanStepStatusOutput(false)).toBe('false')
  })
})
