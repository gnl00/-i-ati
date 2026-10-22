import type { ContextRecord } from '@main/agent/runtime/context/ContextRecord'

/** Restore facts only. Missing results become explicit uncertainty, never replayed tool calls. */
export function restoreSubagentHistory(records: readonly ContextRecord[]): ContextRecord[] {
  const restored: ContextRecord[] = []
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    restored.push(record)
    if (record.kind !== 'assistant_step' || record.step.toolCalls.length === 0) continue
    const results: ContextRecord[] = []
    while (records[index + 1]?.kind === 'tool_result') results.push(records[++index])
    restored.push(...results)
    for (const call of record.step.toolCalls) {
      if (results.some(result => result.kind === 'tool_result' && result.toolCallId === call.id)) continue
      restored.push({
        kind: 'tool_result', recordId: `interrupted:${record.recordId}:${call.id}`, timestamp: record.timestamp,
        stepId: record.step.stepId, toolCallId: call.id, toolCallIndex: call.index ?? 0,
        toolName: call.function.name, status: 'aborted', content: 'The previous run stopped before a result was recorded. Inspect actual side effects before choosing another operation.'
      })
    }
  }
  return restored
}
