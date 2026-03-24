import { create } from 'zustand'
import { invokeChatRunToolConfirm } from '@renderer/invoker/ipcInvoker'
import type { AgentConfirmationSource } from '@shared/tools/approval'

export type ToolConfirmationRequest = {
  toolCallId: string
  name: string
  args?: unknown
  agent?: AgentConfirmationSource
  ui?: {
    title?: string
    riskLevel?: 'risky' | 'dangerous'
    reason?: string
    command?: string
    executionReason?: string
    possibleRisk?: string
    riskScore?: number
  }
}

export interface ToolConfirmationState {
  pendingRequests: ToolConfirmationRequest[]
}

export interface ToolConfirmationActions {
  enqueue: (request: ToolConfirmationRequest) => void
  dequeue: (toolCallId: string) => void
  clear: () => void
  confirm: (toolCallId?: string) => Promise<void>
  cancel: (reason?: string, toolCallId?: string) => Promise<void>
}

export const useToolConfirmationStore = create<
  ToolConfirmationState & ToolConfirmationActions
>((set, get) => ({
  pendingRequests: [],
  enqueue: (request) => set((state) => {
    const exists = state.pendingRequests.some(item => item.toolCallId === request.toolCallId)
    if (exists) {
      return {
        pendingRequests: state.pendingRequests.map(item => (
          item.toolCallId === request.toolCallId ? request : item
        ))
      }
    }
    return {
      pendingRequests: [...state.pendingRequests, request]
    }
  }),
  dequeue: (toolCallId) => set((state) => ({
    pendingRequests: state.pendingRequests.filter(item => item.toolCallId !== toolCallId)
  })),
  clear: () => set({ pendingRequests: [] }),
  confirm: async (toolCallId) => {
    const pendingRequest = toolCallId
      ? get().pendingRequests.find(item => item.toolCallId === toolCallId)
      : get().pendingRequests[0]
    if (!pendingRequest) return
    await invokeChatRunToolConfirm({
      toolCallId: pendingRequest.toolCallId,
      approved: true
    })
    set((state) => ({
      pendingRequests: state.pendingRequests.filter(item => item.toolCallId !== pendingRequest.toolCallId)
    }))
  },
  cancel: async (reason, toolCallId) => {
    const pendingRequest = toolCallId
      ? get().pendingRequests.find(item => item.toolCallId === toolCallId)
      : get().pendingRequests[0]
    if (!pendingRequest) return
    await invokeChatRunToolConfirm({
      toolCallId: pendingRequest.toolCallId,
      approved: false,
      reason
    })
    set((state) => ({
      pendingRequests: state.pendingRequests.filter(item => item.toolCallId !== pendingRequest.toolCallId)
    }))
  }
}))
