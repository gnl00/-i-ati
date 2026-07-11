import { create } from 'zustand'
import type { SubagentRecord } from '@tools/subagent/index.d'

type SubagentRuntimeState = {
  recordsById: Record<string, SubagentRecord>
}

type SubagentRuntimeActions = {
  upsert: (record: SubagentRecord) => void
  markWaitingForConfirmation: (agent: {
    subagentId: string
    role?: SubagentRecord['role']
    task?: string
  }) => void
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
  markWaitingForConfirmation: (agent) => set((state) => {
    const existing = state.recordsById[agent.subagentId]
    const nextRecord: SubagentRecord = existing
      ? {
          ...existing,
          status: 'waiting_for_confirmation'
        }
      : {
          id: agent.subagentId,
          status: 'waiting_for_confirmation',
          role: agent.role || 'general',
          task: agent.task || '',
          created_at: Date.now()
        }

    return {
      recordsById: {
        ...state.recordsById,
        [agent.subagentId]: nextRecord
      }
    }
  }),
  clear: () => set({ recordsById: {} })
}))
