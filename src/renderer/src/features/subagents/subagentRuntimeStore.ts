import { create } from 'zustand'
import type { SubagentRecord } from '@tools/subagent/index.d'

type SubagentRuntimeState = {
  recordsById: Record<string, SubagentRecord>
}

type SubagentRuntimeActions = {
  upsert: (record: SubagentRecord) => void
  clear: () => void
}

export const useSubagentRuntimeStore = create<SubagentRuntimeState & SubagentRuntimeActions>((set) => ({
  recordsById: {},
  upsert: (record) => set((state) => ({
    recordsById: {
      ...state.recordsById,
      [record.id]: record
    }
  })),
  clear: () => set({ recordsById: {} })
}))
