import { create } from 'zustand'
import { invokeChatSubmitToolConfirm } from '@renderer/invoker/ipcInvoker'

export type ToolConfirmationRequest = {
  toolCallId: string
  name: string
  args?: unknown
  ui?: {
    title?: string
    riskLevel?: 'risky' | 'dangerous'
    reason?: string
    command?: string
  }
}

export interface ToolConfirmationState {
  pendingRequest: ToolConfirmationRequest | null
}

export interface ToolConfirmationActions {
  setPending: (request: ToolConfirmationRequest) => void
  clear: () => void
  confirm: () => Promise<void>
  cancel: (reason?: string) => Promise<void>
}

export const useToolConfirmationStore = create<
  ToolConfirmationState & ToolConfirmationActions
>((set, get) => ({
  pendingRequest: null,
  setPending: (request) => set({ pendingRequest: request }),
  clear: () => set({ pendingRequest: null }),
  confirm: async () => {
    const { pendingRequest } = get()
    if (!pendingRequest) return
    await invokeChatSubmitToolConfirm({
      toolCallId: pendingRequest.toolCallId,
      approved: true
    })
    set({ pendingRequest: null })
  },
  cancel: async (reason) => {
    const { pendingRequest } = get()
    if (!pendingRequest) return
    await invokeChatSubmitToolConfirm({
      toolCallId: pendingRequest.toolCallId,
      approved: false,
      reason
    })
    set({ pendingRequest: null })
  }
}))
