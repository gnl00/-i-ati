import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plan } from '@shared/task-planner/schemas'
import { planningDb } from '@main/db/planning'
import { processPlan } from '../TaskPlannerProcessor'

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
    }),
    saveTaskPlan: vi.fn(),
    updateTaskPlanStatus: vi.fn(),
    updateTaskPlanStepStatus: vi.fn(),
    getTaskPlansByChatUuid: vi.fn(() => planStore ? [{
      ...planStore,
      steps: planStore.steps.map(step => ({ ...step }))
    }] : []),
    deleteTaskPlan: vi.fn(),
    upsertTaskPlanStep: vi.fn()
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

  it('merges partial update payloads with the existing plan', async () => {
    const result = await processPlan({
      action: 'update',
      plan: {
        id: 'plan-1',
        status: 'completed'
      }
    })

    expect(result.success).toBe(true)
    const plan = (result as { plan?: Plan }).plan
    expect(plan).toMatchObject({
      id: 'plan-1',
      chatUuid: 'chat-1',
      goal: 'Ship feature',
      status: 'completed',
      createdAt: 1000,
      updatedAt: Date.now()
    })
    expect(plan?.steps).toEqual(existingPlan.steps)
  })

  it('returns a clear error when update targets an unknown plan', async () => {
    const result = await processPlan({
      action: 'update',
      plan: {
        id: 'missing-plan',
        status: 'completed'
      }
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('Plan not found: missing-plan')
  })

  it('requires action and reports the supported action set', async () => {
    expect(await processPlan({})).toEqual({
      success: false,
      message: 'Missing required parameter: action'
    })
    expect(await processPlan({ action: 'archive' })).toEqual({
      success: false,
      message: 'Invalid action: archive. Expected one of: create, update, update_status, get_by_id, get_current_chat, delete, step_upsert'
    })
  })

  it.each([
    [{ action: 'create' }, 'goal is required'],
    [{ action: 'create', goal: 'Ship' }, 'steps is required'],
    [{ action: 'update' }, 'plan.id is required'],
    [{ action: 'update', plan: { status: 'completed' } }, 'plan.id is required'],
    [{ action: 'update_status' }, 'id is required'],
    [{ action: 'update_status', id: 'plan-1' }, 'status is required'],
    [{ action: 'get_by_id' }, 'id is required'],
    [{ action: 'delete' }, 'id is required'],
    [{ action: 'step_upsert' }, 'planId is required'],
    [{ action: 'step_upsert', planId: 'plan-1' }, 'step is required']
  ])('validates required fields for flat action payload %o', async (args, message) => {
    const result = await processPlan(args as any)

    expect(result).toEqual({ success: false, message })
  })

  it('routes valid canonical actions through their existing storage operations', async () => {
    await expect(processPlan({
      action: 'create',
      goal: 'Create plan',
      steps: [{ id: '1', title: 'Inspect', status: 'todo' }]
    })).resolves.toMatchObject({ success: true })
    await expect(processPlan({ action: 'update_status', id: 'plan-1', status: 'running' }))
      .resolves.toMatchObject({ success: true })
    await expect(processPlan({ action: 'get_by_id', id: 'plan-1' }))
      .resolves.toMatchObject({ success: true, plan: expect.objectContaining({ id: 'plan-1' }) })
    await expect(processPlan({ action: 'get_current_chat', chat_uuid: 'chat-1' }))
      .resolves.toMatchObject({ success: true, plans: [expect.objectContaining({ id: 'plan-1' })] })
    await expect(processPlan({ action: 'delete', id: 'plan-1' })).resolves.toMatchObject({ success: true })
    await expect(processPlan({
      action: 'step_upsert',
      planId: 'plan-1',
      step: { id: 'step-3', title: 'Verify', status: 'todo' }
    })).resolves.toMatchObject({ success: true })

    expect(planningDb.saveTaskPlan).toHaveBeenCalledOnce()
    expect(planningDb.updateTaskPlanStatus).toHaveBeenCalledWith('plan-1', 'running', undefined, undefined)
    expect(planningDb.deleteTaskPlan).toHaveBeenCalledWith('plan-1')
    expect(planningDb.upsertTaskPlanStep).toHaveBeenCalledWith(
      'plan-1',
      { id: 'step-3', title: 'Verify', status: 'todo' }
    )
  })
})
