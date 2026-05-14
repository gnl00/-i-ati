import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plan } from '@shared/task-planner/schemas'
import { processPlanUpdate } from '../TaskPlannerProcessor'

let planStore: Plan | undefined

vi.mock('@main/db/planning', () => ({
  planningDb: {
    getTaskPlanById: vi.fn((id: string) => {
      if (planStore?.id !== id) return undefined
      return {
        ...planStore,
        steps: planStore.steps.map(step => ({ ...step }))
      }
    }),
    updateTaskPlan: vi.fn((plan: Plan) => {
      planStore = {
        ...plan,
        steps: plan.steps.map(step => ({ ...step }))
      }
    })
  }
}))

const existingPlan: Plan = {
  id: 'plan-1',
  chatUuid: 'chat-1',
  goal: 'Ship feature',
  status: 'running',
  steps: [
    { id: 'step-1', title: 'Inspect', status: 'done' },
    { id: 'step-2', title: 'Patch', status: 'doing' }
  ],
  createdAt: 1000,
  updatedAt: 2000
}

describe('TaskPlannerProcessor', () => {
  beforeEach(() => {
    planStore = {
      ...existingPlan,
      steps: existingPlan.steps.map(step => ({ ...step }))
    }
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T02:30:00.000Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('merges partial plan_update payloads with the existing plan', async () => {
    const result = await processPlanUpdate({
      plan: {
        id: 'plan-1',
        status: 'completed'
      }
    })

    expect(result.success).toBe(true)
    expect(result.plan).toMatchObject({
      id: 'plan-1',
      chatUuid: 'chat-1',
      goal: 'Ship feature',
      status: 'completed',
      createdAt: 1000,
      updatedAt: Date.now()
    })
    expect(result.plan?.steps).toEqual(existingPlan.steps)
  })

  it('returns a clear error when plan_update is missing plan.id', async () => {
    const result = await processPlanUpdate({ plan: { status: 'completed' } as any })

    expect(result.success).toBe(false)
    expect(result.message).toBe('plan.id is required')
  })

  it('returns a clear error when plan_update targets an unknown plan', async () => {
    const result = await processPlanUpdate({
      plan: {
        id: 'missing-plan',
        status: 'completed'
      }
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('Plan not found: missing-plan')
  })
})
