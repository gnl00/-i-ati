import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import type { ToolDefinition } from '@tools/registry'
import { todoTools } from '../definitions'
import { todoToolMetadata } from '../metadata'

describe('todo tool definition', () => {
  it('exposes one flat todo schema with a required action', () => {
    expect(todoTools).toHaveLength(1)

    const todoTool = todoTools[0]
    expect(todoTool.function.name).toBe('todo')
    expect(todoTool.function.parameters.required).toEqual(['action'])
    expect(todoTool.function.parameters.properties.action).toEqual(expect.objectContaining({
      type: 'string',
      enum: ['add', 'list', 'update', 'delete']
    }))
    expect(todoTool.function.parameters.properties).toEqual(expect.objectContaining({
      id: expect.any(Object),
      title: expect.any(Object),
      notes: expect.any(Object),
      status: expect.any(Object),
      priority: expect.any(Object),
      tags: expect.any(Object),
      scope: expect.any(Object),
      tag: expect.any(Object),
      limit: expect.any(Object)
    }))
  })

  it('keeps only todo in public definitions and metadata', () => {
    const publicTodoDefinitions = (tools as ToolDefinition[])
      .filter(tool => tool.function.name === 'todo')

    expect(publicTodoDefinitions.map(tool => tool.function.name)).toEqual(['todo'])
    expect(publicTodoDefinitions[0].function.parameters.required).toContain('action')
    expect(todoToolMetadata).toEqual({
      todo: {
        capability: 'todo',
        riskLevel: 'warning',
        mutatesWorkspace: false,
        subagent: 'deny'
      }
    })
  })
})
