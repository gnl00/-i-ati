import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'
import { scheduleTools } from '../definitions'
import { scheduleToolMetadata } from '../metadata'

describe('schedule tool definition', () => {
  it('exposes one flat schedule schema with a required action', () => {
    expect(scheduleTools).toHaveLength(1)

    const scheduleTool = scheduleTools[0]
    expect(scheduleTool.function.name).toBe('schedule')
    expect(scheduleTool.function.parameters.required).toEqual(['action'])
    expect(scheduleTool.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['create', 'list', 'cancel', 'update']
    }))
    expect(scheduleTool.function.parameters.properties).toEqual(expect.objectContaining({
      id: expect.any(Object),
      goal: expect.any(Object),
      run_at: expect.any(Object),
      cron_expression: expect.any(Object),
      timezone: expect.any(Object),
      plan_id: expect.any(Object),
      payload: expect.any(Object),
      max_attempts: expect.any(Object)
    }))
  })

  it('keeps one public schedule definition and metadata entry', () => {
    const publicScheduleDefinitions = (tools as ToolDefinition[])
      .filter(tool => tool.function.name.startsWith('schedule'))

    expect(publicScheduleDefinitions.map(tool => tool.function.name)).toEqual(['schedule'])
    expect(publicScheduleDefinitions[0].function.parameters.required).toContain('action')
    expect(scheduleToolMetadata).toEqual({
      schedule: {
        capability: 'schedule',
        riskLevel: 'warning',
        mutatesWorkspace: false,
        subagent: 'deny'
      }
    })
  })
})
