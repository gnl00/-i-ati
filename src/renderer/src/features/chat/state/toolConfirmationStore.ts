import { create } from 'zustand'
import { invokeRunToolConfirm, invokeToolConfirmationSnapshot } from '@renderer/infrastructure/ipc'
import type { ToolConfirmation, ToolConfirmationDecision } from '@shared/tools/confirmation'
export type { ToolConfirmationRequest } from '@shared/tools/confirmation'

type ToolConfirmationState = {
  chatUuid: string | null
  generation: number
  snapshotVersion: number
  confirmations: Record<string, ToolConfirmation>
  pendingRequests: ToolConfirmation[]
  activate: (chatUuid: string | null) => void
  apply: (confirmation: ToolConfirmation) => void
  hydrate: (chatUuid: string) => Promise<void>
  confirm: (confirmationId?: string) => Promise<void>
  cancel: (reason?: string, confirmationId?: string) => Promise<void>
}

function pendingRequests(records: Record<string, ToolConfirmation>): ToolConfirmation[] {
  return Object.values(records).filter(item => item.status === 'pending').sort((a, b) => a.createdAt - b.createdAt || a.version - b.version)
}

export const useToolConfirmationStore = create<ToolConfirmationState>((set, get) => {
  const submit = async (confirmationId: string | undefined, decision: ToolConfirmationDecision): Promise<void> => {
    const state = get()
    const request = confirmationId
      ? state.pendingRequests.find(item => item.confirmationId === confirmationId)
      : state.pendingRequests[0]
    if (!request) return
    const generation = state.generation
    const result = await invokeRunToolConfirm({
      confirmationId: request.confirmationId,
      chatUuid: request.chatUuid,
      submissionId: request.submissionId,
      toolCallId: request.toolCallId,
      ...decision
    })
    if (get().generation !== generation) return
    if (result.confirmation) get().apply(result.confirmation)
    if (!result.ok && !result.confirmation) {
      await get().hydrate(request.chatUuid)
      throw new Error(`Tool approval was not accepted: ${result.reason}`)
    }
  }
  return {
    chatUuid: null,
    generation: 0,
    snapshotVersion: 0,
    confirmations: {},
    pendingRequests: [],
    activate: chatUuid => set(state => ({
      chatUuid, generation: state.generation + 1, snapshotVersion: 0,
      confirmations: {}, pendingRequests: []
    })),
    apply: confirmation => set(state => {
      if (confirmation.chatUuid !== state.chatUuid) return state
      const previous = state.confirmations[confirmation.confirmationId]
      if (confirmation.version <= state.snapshotVersion || (previous && confirmation.version <= previous.version)) return state
      const confirmations = { ...state.confirmations, [confirmation.confirmationId]: confirmation }
      return { confirmations, pendingRequests: pendingRequests(confirmations) }
    }),
    hydrate: async chatUuid => {
      const generation = get().generation
      const snapshot = await invokeToolConfirmationSnapshot({ chatUuid })
      set(state => {
        if (state.chatUuid !== chatUuid || state.generation !== generation || snapshot.version < state.snapshotVersion) return state
        const confirmations = Object.fromEntries(snapshot.confirmations.filter(item => item.chatUuid === chatUuid).map(item => [item.confirmationId, item]))
        // Events delivered during the snapshot read are authoritative when newer than its watermark.
        for (const item of Object.values(state.confirmations)) {
          if (item.version > snapshot.version) confirmations[item.confirmationId] = item
        }
        return { confirmations, snapshotVersion: snapshot.version, pendingRequests: pendingRequests(confirmations) }
      })
    },
    confirm: id => submit(id, { approved: true }),
    cancel: (reason, id) => submit(id, { approved: false, reason })
  }
})

export function findToolConfirmation(
  records: Record<string, ToolConfirmation>,
  toolCallId?: string
): ToolConfirmation | undefined {
  if (!toolCallId) return undefined
  return Object.values(records).filter(item => item.toolCallId === toolCallId).sort((a, b) => b.version - a.version)[0]
}
