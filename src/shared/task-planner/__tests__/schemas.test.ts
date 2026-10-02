import { describe, expect, it } from 'vitest'
import { CreatePlanSchema, PlanSchema, PlanStepSchema } from '../schemas'

describe('task planner schemas', () => {
  const step = { id: 'step-1', title: 'Inspect', status: 'todo' }
  const plan = {
    id: 'plan-1', goal: 'Ship', status: 'pending', steps: [step],
    createdAt: 1, updatedAt: 1,
  }
  const records = { text: 'value', count: 2, nested: { enabled: true }, list: [1], empty: null }

  it('preserves arbitrary string-keyed context and step input values', () => {
    expect(CreatePlanSchema.parse({ goal: 'Ship', context: records }).context).toEqual(records)
    expect(PlanStepSchema.parse({ ...step, input: records }).input).toEqual(records)
    expect(PlanSchema.parse({ ...plan, context: records }).context).toEqual(records)
  })

  it('accepts omitted optional records and empty records', () => {
    expect(CreatePlanSchema.parse({ goal: 'Ship' })).toEqual({ goal: 'Ship' })
    expect(PlanStepSchema.parse(step)).toEqual(step)
    expect(PlanSchema.parse(plan)).toEqual(plan)
    expect(CreatePlanSchema.parse({ goal: 'Ship', context: {} }).context).toEqual({})
    expect(PlanStepSchema.parse({ ...step, input: {} }).input).toEqual({})
    expect(PlanSchema.parse({ ...plan, context: {} }).context).toEqual({})
  })

  it.each([null, [], 'invalid', 1])('rejects non-object records: %j', (value) => {
    expect(CreatePlanSchema.safeParse({ goal: 'Ship', context: value }).success).toBe(false)
    expect(PlanStepSchema.safeParse({ ...step, input: value }).success).toBe(false)
    expect(PlanSchema.safeParse({ ...plan, context: value }).success).toBe(false)
  })
})
