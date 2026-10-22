import { expect, it } from 'vitest'
import { restoreSubagentHistory } from '../runtime/SubagentHistory'
import type { ContextRecord } from '@main/agent/runtime/context/ContextRecord'

it('restores a missing tool result as uncertainty while preserving recorded results', () => {
  const records: ContextRecord[] = [{ kind: 'assistant_step', recordId: 'assistant', timestamp: 1, step: {
    stepId: 'step', stepIndex: 0, status: 'completed', startedAt: 1, completedAt: 2, content: '', toolCalls: [
      { id: 'known', type: 'function', function: { name: 'read', arguments: '{}' } },
      { id: 'unknown', type: 'function', function: { name: 'exec', arguments: '{}' } }
    ]
  } }, { kind: 'tool_result', recordId: 'known-result', timestamp: 2, stepId: 'step', toolCallId: 'known', toolCallIndex: 0, toolName: 'read', status: 'success', content: 'evidence' }]
  const restored = restoreSubagentHistory(records)
  expect(restored).toHaveLength(3)
  expect(restored[1]).toBe(records[1])
  expect(restored[2]).toMatchObject({ kind: 'tool_result', toolCallId: 'unknown', status: 'aborted', content: expect.stringContaining('Inspect actual side effects') })
  expect(restoreSubagentHistory(restored)).toEqual(restored)
  expect(records).toHaveLength(2)
})
