export type RunPhase = 'idle' | 'submitting' | 'streaming' | 'post_run' | 'cancelling'
export type PostRunJobStatus = 'idle' | 'pending' | 'failed'
export type PostRunJobsState = {
  title: PostRunJobStatus
  compression: PostRunJobStatus
}
export type RunOutcome = 'idle' | 'completed' | 'failed' | 'aborted'

export type ChatRunScrollHint =
  | { type: 'none' }
  | { type: 'conversation-switch'; chatUuid: string | null; index: number; align: 'start' | 'end' }
  | { type: 'user-sent'; chatUuid: string | null; messageId?: number }
  | { type: 'search-result'; chatUuid: string | null; messageId: number }

export type ChatRunUiState = {
  runPhase: RunPhase
  postRunJobs: PostRunJobsState
  lastRunOutcome: RunOutcome
  scrollHint: ChatRunScrollHint
  forceCompleteTypewriter: (() => void) | null
}

export type ChatRunUiActions = {
  setRunPhase: (phase: RunPhase) => void
  setPostRunJobState: (job: keyof PostRunJobsState, state: PostRunJobStatus) => void
  resetPostRunJobs: () => void
  setLastRunOutcome: (outcome: RunOutcome) => void
  setScrollHint: (hint: ChatRunScrollHint) => void
  clearScrollHint: () => void
  setForceCompleteTypewriter: (fn: (() => void) | null) => void
}

export const createInitialChatRunUiState = (): ChatRunUiState => ({
  runPhase: 'idle',
  postRunJobs: {
    title: 'idle',
    compression: 'idle'
  },
  lastRunOutcome: 'idle',
  scrollHint: { type: 'none' },
  forceCompleteTypewriter: null
})

export function createChatRunUiActions(
  set: (partial: Partial<ChatRunUiState> | ((state: ChatRunUiState) => Partial<ChatRunUiState>)) => void
): ChatRunUiActions {
  return {
    setRunPhase: (phase) => set({ runPhase: phase }),
    setPostRunJobState: (job, state) => set((prevState) => ({
      postRunJobs: {
        ...prevState.postRunJobs,
        [job]: state
      }
    })),
    resetPostRunJobs: () => set({
      postRunJobs: {
        title: 'idle',
        compression: 'idle'
      }
    }),
    setLastRunOutcome: (outcome) => set({ lastRunOutcome: outcome }),
    setScrollHint: (hint) => set({ scrollHint: hint }),
    clearScrollHint: () => set({ scrollHint: { type: 'none' } }),
    setForceCompleteTypewriter: (fn) => set({ forceCompleteTypewriter: fn })
  }
}
