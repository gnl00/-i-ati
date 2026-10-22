import { beforeEach, expect, it } from 'vitest'
import { useSubagentRuntimeStore } from '../subagentRuntimeStore'
import type { SubagentRecord } from '@tools/subagent/index.d'

beforeEach(() => useSubagentRuntimeStore.getState().clear())

it('keeps terminal state when an older queued or running event arrives later', () => {
  const record: SubagentRecord = { id: 'child', task: 'inspect', role: 'reviewer', status: 'completed', created_at: 1, revision: 4 }
  const { upsert } = useSubagentRuntimeStore.getState()
  upsert(record)
  upsert({ ...record, status: 'running', revision: 2 })
  upsert({ ...record, status: 'queued', revision: 1 })
  expect(useSubagentRuntimeStore.getState().recordsById.child).toEqual(record)
  upsert({ ...record, id: 'other', status: 'cancelling', revision: 3 })
  expect(useSubagentRuntimeStore.getState().recordsById.other.status).toBe('cancelling')
})
