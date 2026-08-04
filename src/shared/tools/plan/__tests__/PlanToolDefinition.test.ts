import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'
import { planTools } from '../definitions'
import { planToolMetadata } from '../metadata'

describe('plan tool definition', () => {
  it('exposes one flat plan schema with a required action', () => {
    expect(planTools).toHaveLength(1)

    const planTool = planTools[0]
    expect(planTool.function.name).toBe('plan')
    expect(planTool.function.parameters.required).toEqual(['action'])
    expect(planTool.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['create', 'update', 'update_status', 'get_by_id', 'get_current_chat', 'delete', 'step_upsert']
    }))
    expect(planTool.function.parameters.properties).toEqual(expect.objectContaining({
      goal: expect.any(Object),
      steps: expect.any(Object),
      plan: expect.any(Object),
      id: expect.any(Object),
      status: expect.any(Object),
      stepId: expect.any(Object),
      stepStatus: expect.any(Object),
      planId: expect.any(Object),
      step: expect.any(Object)
    }))
  })

  it('keeps one public plan definition and metadata entry', () => {
    const publicPlanDefinitions = (tools as ToolDefinition[])
      .filter(tool => tool.function.name.startsWith('plan'))

    expect(publicPlanDefinitions.map(tool => tool.function.name)).toEqual(['plan'])
    expect(publicPlanDefinitions[0].function.parameters.required).toContain('action')
    expect(planToolMetadata).toEqual({
      plan: {
        capability: 'plan',
        riskLevel: 'warning',
        mutatesWorkspace: false,
        subagent: 'deny'
      }
    })
  })
})
