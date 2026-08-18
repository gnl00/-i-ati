import { create } from 'zustand'
import {
  invokeRunToolUserQuestionListPending,
  invokeRunToolUserQuestionSubmit
} from '@renderer/infrastructure/ipc'
import type {
  PendingToolQuestion,
  ToolUserQuestionAnswer,
  ToolUserQuestionSubmitResult
} from '@shared/tools/userQuestion'

export interface ToolUserQuestionState {
  pendingRequests: PendingToolQuestion[]
  hydratingChatUuid: string | null
}

export interface ToolUserQuestionActions {
  enqueue: (request: PendingToolQuestion) => void
  dequeue: (interactionId: string) => void
  replaceForChat: (chatUuid: string, requests: PendingToolQuestion[]) => void
  clear: () => void
  hydrate: (chatUuid: string) => Promise<void>
  submit: (
    request: PendingToolQuestion,
    answers: ToolUserQuestionAnswer[]
  ) => Promise<ToolUserQuestionSubmitResult>
  cancel: (
    request: PendingToolQuestion,
    reason?: string
  ) => Promise<ToolUserQuestionSubmitResult>
}

function upsertPendingQuestion(
  pendingRequests: PendingToolQuestion[],
  request: PendingToolQuestion
): PendingToolQuestion[] {
  const existingIndex = pendingRequests.findIndex(item => item.interactionId === request.interactionId)
  if (existingIndex < 0) {
    return [...pendingRequests, request]
  }

  return pendingRequests.map((item, index) => index === existingIndex ? request : item)
}

export const useToolUserQuestionStore = create<
  ToolUserQuestionState & ToolUserQuestionActions
>((set, get) => ({
  pendingRequests: [],
  hydratingChatUuid: null,
  enqueue: request => set(state => ({
    pendingRequests: upsertPendingQuestion(state.pendingRequests, request)
  })),
  dequeue: interactionId => set(state => ({
    pendingRequests: state.pendingRequests.filter(item => item.interactionId !== interactionId)
  })),
  replaceForChat: (chatUuid, requests) => set(state => ({
    pendingRequests: [
      ...state.pendingRequests.filter(item => item.chatUuid !== chatUuid),
      ...requests
    ]
  })),
  clear: () => set({ pendingRequests: [], hydratingChatUuid: null }),
  hydrate: async chatUuid => {
    set({ hydratingChatUuid: chatUuid })
    try {
      const result = await invokeRunToolUserQuestionListPending({ chatUuid })
      if (get().hydratingChatUuid !== chatUuid) {
        return
      }
      get().replaceForChat(chatUuid, result.questions)
    } finally {
      set(state => ({
        hydratingChatUuid: state.hydratingChatUuid === chatUuid
          ? null
          : state.hydratingChatUuid
      }))
    }
  },
  submit: async (request, answers) => {
    const result = await invokeRunToolUserQuestionSubmit({
      submissionId: request.submissionId,
      chatUuid: request.chatUuid,
      toolCallId: request.toolCallId,
      interactionId: request.interactionId,
      action: 'submit',
      answers
    })
    if (result.ok || result.reason === 'not_found' || result.reason === 'already_resolved') {
      get().dequeue(request.interactionId)
    }
    return result
  },
  cancel: async (request, reason) => {
    const result = await invokeRunToolUserQuestionSubmit({
      submissionId: request.submissionId,
      chatUuid: request.chatUuid,
      toolCallId: request.toolCallId,
      interactionId: request.interactionId,
      action: 'cancel',
      reason
    })
    if (result.ok || result.reason === 'not_found' || result.reason === 'already_resolved') {
      get().dequeue(request.interactionId)
    }
    return result
  }
}))
