import { describe, expect, it } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import {
  buildActiveToolCallReason,
  buildToolCallReasonItem,
  buildToolCallReasonModel
} from '../model/toolCallReason'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'

const toolCallItem = (args: {
  id: string
  name: string
  order: number
  reason?: string
  status?: string
  cost?: number
  result?: unknown
}): SupportSegmentRenderItem => ({
  key: args.id,
  layer: 'committed',
  sourceIndex: args.order,
  order: args.order,
  isStreamingTail: false,
  segment: {
    type: 'toolCall',
    segmentId: `segment-${args.id}`,
    name: args.name,
    timestamp: 1,
    toolCallId: args.id,
    toolCallIndex: args.order,
    cost: args.cost,
    content: {
      toolName: args.name,
      args: JSON.stringify({
        input: 'value',
        ...(args.reason ? { [TOOL_CALL_REASON_PARAMETER_NAME]: args.reason } : {})
      }),
      status: args.status ?? 'pending',
      ...(args.result !== undefined ? { result: args.result } : {})
    }
  }
})

describe('toolCallReason', () => {
  it('builds a single reason item from a tool call segment', () => {
    expect(buildToolCallReasonItem(toolCallItem({
      id: 'tool-1',
      name: 'read',
      order: 1,
      reason: 'Inspect the current layout implementation.'
    }))).toEqual({
      id: 'tool-1',
      toolName: 'read',
      reason: 'Inspect the current layout implementation.',
      order: 1,
      isTerminal: false
    })
  })

  it('extracts explicit tool_call_reason values from tool call segments in order', () => {
    const model = buildToolCallReasonModel([
      toolCallItem({
        id: 'tool-2',
        name: 'grep',
        order: 2,
        reason: 'Find the definition before reading surrounding code.'
      }),
      toolCallItem({
        id: 'tool-1',
        name: 'read',
        order: 1,
        reason: 'Inspect the current layout implementation.'
      }),
      toolCallItem({
        id: 'tool-3',
        name: 'ls',
        order: 3
      })
    ])

    expect(model.items).toEqual([
      {
        id: 'tool-1',
        toolName: 'read',
        reason: 'Inspect the current layout implementation.',
        order: 1,
        isTerminal: false
      },
      {
        id: 'tool-2',
        toolName: 'grep',
        reason: 'Find the definition before reading surrounding code.',
        order: 2,
        isTerminal: false
      }
    ])
  })

  it('selects the earliest non-terminal reason and hides it after all tool calls complete', () => {
    expect(buildActiveToolCallReason([
      toolCallItem({
        id: 'tool-1',
        name: 'read',
        order: 1,
        reason: 'Read the file first.',
        status: 'success',
        result: { ok: true }
      }),
      toolCallItem({
        id: 'tool-2',
        name: 'search',
        order: 2,
        reason: 'Search after reading.',
        status: 'running'
      }),
      toolCallItem({
        id: 'tool-3',
        name: 'shell',
        order: 3,
        reason: 'Typecheck at the end.',
        status: 'pending'
      })
    ])?.id).toBe('tool-2')

    expect(buildActiveToolCallReason([
      toolCallItem({
        id: 'tool-1',
        name: 'read',
        order: 1,
        reason: 'Read the file first.',
        status: 'success',
        result: { ok: true }
      }),
      toolCallItem({
        id: 'tool-2',
        name: 'search',
        order: 2,
        reason: 'Search after reading.',
        status: 'success',
        result: { ok: true }
      })
    ])).toBeUndefined()
  })

  it('extracts escaped tool_call_reason values without parsing the full args payload', () => {
    const baseItem = toolCallItem({
      id: 'tool-1',
      name: 'write',
      order: 1
    })
    const baseSegment = baseItem.segment as ToolCallSegment

    expect(buildToolCallReasonItem({
      ...baseItem,
      segment: {
        ...baseSegment,
        content: {
          toolName: 'write',
          args: '{"content":"large unfinished payload","tool_call_reason":"Write \\"quoted\\" content before running tests.","path":"src/file.ts"}',
          status: 'pending'
        }
      }
    })?.reason).toBe('Write "quoted" content before running tests.')
  })
})
