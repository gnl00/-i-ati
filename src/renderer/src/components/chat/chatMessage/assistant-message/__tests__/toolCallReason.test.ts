import { describe, expect, it } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { getReasonFromToolCall } from '../model/toolCallReason'

const toolCallSegment = (args: {
  id?: string
  name?: string
  args?: unknown
}): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: args.id ?? 'segment-tool-1',
  name: args.name ?? 'read',
  timestamp: 1,
  toolCallId: args.id ?? 'tool-1',
  toolCallIndex: 0,
  content: {
    toolName: args.name ?? 'read',
    status: 'pending',
    args: args.args
  }
})

describe('toolCallReason', () => {
  it('extracts reason values from object args', () => {
    expect(getReasonFromToolCall(toolCallSegment({
      args: {
        input: 'value',
        [TOOL_CALL_REASON_PARAMETER_NAME]: 'Inspect the current layout implementation.'
      }
    }))).toBe('Inspect the current layout implementation.')
  })

  it('extracts reason values from JSON string args without parsing the full payload', () => {
    expect(getReasonFromToolCall(toolCallSegment({
      name: 'write',
      args: '{"content":"large unfinished payload","tool_call_reason":"Write \\"quoted\\" content before running tests.","path":"src/file.ts"}'
    }))).toBe('Write "quoted" content before running tests.')
  })

  it('returns undefined for blank or missing reason values', () => {
    expect(getReasonFromToolCall(toolCallSegment({
      args: {
        input: 'value'
      }
    }))).toBeUndefined()

    expect(getReasonFromToolCall(toolCallSegment({
      args: {
        [TOOL_CALL_REASON_PARAMETER_NAME]: '   '
      }
    }))).toBeUndefined()
  })
})
