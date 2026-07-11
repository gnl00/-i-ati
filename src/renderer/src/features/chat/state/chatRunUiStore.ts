export type RunPhase = 'idle' | 'submitting' | 'streaming' | 'post_run' | 'cancelling'
export type PostRunJobStatus = 'idle' | 'pending' | 'failed'
export type PostRunJobsState = {
  title: PostRunJobStatus
  compression: PostRunJobStatus
}
export type RunOutcome = 'idle' | 'completed' | 'failed' | 'aborted'

export type ChatRunStatusState = {
  runPhase: RunPhase
  postRunJobs: PostRunJobsState
  lastRunOutcome: RunOutcome
}

export type ChatRunScrollHint =
  | { type: 'none' }
  | { type: 'conversation-switch'; chatUuid: string | null; index: number; align: 'start' | 'end' }
  | { type: 'user-sent'; chatUuid: string | null; messageId?: number }
  | { type: 'search-result'; chatUuid: string | null; messageId: number }

export type ChatRunUiState = ChatRunStatusState & {
  runUiByChatUuid: Record<string, ChatRunStatusState>
  scrollHint: ChatRunScrollHint
  forceCompleteTypewriter: (() => void) | null
}

export type ChatRunUiActions = {
  setRunPhase: (phase: RunPhase) => void
  setRunPhaseForChat: (chatUuid: string, phase: RunPhase) => void
  setPostRunJobState: (job: keyof PostRunJobsState, state: PostRunJobStatus) => void
  setPostRunJobStateForChat: (chatUuid: string, job: keyof PostRunJobsState, state: PostRunJobStatus) => void
  resetPostRunJobs: () => void
  resetPostRunJobsForChat: (chatUuid: string) => void
  setLastRunOutcome: (outcome: RunOutcome) => void
  setLastRunOutcomeForChat: (chatUuid: string, outcome: RunOutcome) => void
  getRunStatusForChat: (chatUuid: string | null | undefined) => ChatRunStatusState
  restoreRunStatusForChat: (chatUuid: string | null | undefined) => void
  setScrollHint: (hint: ChatRunScrollHint) => void
  clearScrollHint: () => void
  setForceCompleteTypewriter: (fn: (() => void) | null) => void
}

export const createInitialChatRunStatusState = (): ChatRunStatusState => ({
  runPhase: 'idle',
  postRunJobs: {
    title: 'idle',
    compression: 'idle'
  },
  lastRunOutcome: 'idle'
})

export const createInitialChatRunUiState = (): ChatRunUiState => ({
  ...createInitialChatRunStatusState(),
  runUiByChatUuid: {},
  scrollHint: { type: 'none' },
  forceCompleteTypewriter: null
})

type ChatRunUiContext = {
  currentChatUuid: string | null
}

type ChatRunUiSliceState = ChatRunUiState & ChatRunUiActions & ChatRunUiContext

function clonePostRunJobs(postRunJobs: PostRunJobsState): PostRunJobsState {
  return {
    title: postRunJobs.title,
    compression: postRunJobs.compression
  }
}

function getVisibleRunStatus(state: ChatRunUiState): ChatRunStatusState {
  return {
    runPhase: state.runPhase,
    postRunJobs: clonePostRunJobs(state.postRunJobs),
    lastRunOutcome: state.lastRunOutcome
  }
}

function updateRunStatusForChat<T extends ChatRunUiSliceState>(
  prevState: T,
  chatUuid: string,
  update: (status: ChatRunStatusState) => ChatRunStatusState
): Partial<T> {
  const previousStatus = prevState.runUiByChatUuid[chatUuid] ?? createInitialChatRunStatusState()
  const nextStatus = update({
    ...previousStatus,
    postRunJobs: clonePostRunJobs(previousStatus.postRunJobs)
  })
  const runUiByChatUuid = {
    ...prevState.runUiByChatUuid,
    [chatUuid]: nextStatus
  }

  if (prevState.currentChatUuid === chatUuid) {
    return {
      ...nextStatus,
      runUiByChatUuid
    } as Partial<T>
  }

  return {
    runUiByChatUuid
  } as Partial<T>
}

export function createChatRunUiActions<T extends ChatRunUiSliceState>(
  set: (
    partial: Partial<T> | ((state: T) => Partial<T>)
  ) => void,
  get: () => T
): ChatRunUiActions {
  return {
    setRunPhase: (phase) => set((prevState) => {
      const chatUuid = prevState.currentChatUuid
      if (!chatUuid) {
        return { runPhase: phase } as Partial<T>
      }

      return updateRunStatusForChat(prevState, chatUuid, status => ({
        ...status,
        runPhase: phase
      }))
    }),
    setRunPhaseForChat: (chatUuid, phase) => set((prevState) => (
      updateRunStatusForChat(prevState, chatUuid, status => ({
        ...status,
        runPhase: phase
      }))
    )),
    setPostRunJobState: (job, state) => set((prevState) => ({
      postRunJobs: {
        ...prevState.postRunJobs,
        [job]: state
      },
      ...(prevState.currentChatUuid
        ? {
          runUiByChatUuid: {
            ...prevState.runUiByChatUuid,
            [prevState.currentChatUuid]: {
              runPhase: prevState.runPhase,
              postRunJobs: {
                ...prevState.postRunJobs,
                [job]: state
              },
              lastRunOutcome: prevState.lastRunOutcome
            }
          }
        }
        : {})
    } as Partial<T>)),
    setPostRunJobStateForChat: (chatUuid, job, state) => set((prevState) => (
      updateRunStatusForChat(prevState, chatUuid, status => ({
        ...status,
        postRunJobs: {
          ...status.postRunJobs,
          [job]: state
        }
      }))
    )),
    resetPostRunJobs: () => set((prevState) => {
      const postRunJobs = createInitialChatRunStatusState().postRunJobs
      return {
        postRunJobs,
        ...(prevState.currentChatUuid
          ? {
            runUiByChatUuid: {
              ...prevState.runUiByChatUuid,
              [prevState.currentChatUuid]: {
                runPhase: prevState.runPhase,
                postRunJobs,
                lastRunOutcome: prevState.lastRunOutcome
              }
            }
          }
          : {})
      } as Partial<T>
    }),
    resetPostRunJobsForChat: (chatUuid) => set((prevState) => (
      updateRunStatusForChat(prevState, chatUuid, status => ({
        ...status,
        postRunJobs: createInitialChatRunStatusState().postRunJobs
      }))
    )),
    setLastRunOutcome: (outcome) => set((prevState) => ({
      lastRunOutcome: outcome,
      ...(prevState.currentChatUuid
        ? {
          runUiByChatUuid: {
            ...prevState.runUiByChatUuid,
            [prevState.currentChatUuid]: {
              runPhase: prevState.runPhase,
              postRunJobs: clonePostRunJobs(prevState.postRunJobs),
              lastRunOutcome: outcome
            }
          }
        }
        : {})
    } as Partial<T>)),
    setLastRunOutcomeForChat: (chatUuid, outcome) => set((prevState) => (
      updateRunStatusForChat(prevState, chatUuid, status => ({
        ...status,
        lastRunOutcome: outcome
      }))
    )),
    getRunStatusForChat: (chatUuid) => {
      if (!chatUuid) {
        return createInitialChatRunStatusState()
      }

      const state = get()
      if (state.currentChatUuid === chatUuid) {
        return getVisibleRunStatus(state)
      }

      return state.runUiByChatUuid[chatUuid] ?? createInitialChatRunStatusState()
    },
    restoreRunStatusForChat: (chatUuid) => set((prevState) => {
      if (!prevState.currentChatUuid || prevState.currentChatUuid === chatUuid) {
        const restored = chatUuid
          ? (prevState.runUiByChatUuid[chatUuid] ?? createInitialChatRunStatusState())
          : createInitialChatRunStatusState()
        return {
          ...restored,
          runUiByChatUuid: chatUuid
            ? {
              ...prevState.runUiByChatUuid,
              [chatUuid]: restored
            }
            : prevState.runUiByChatUuid
        } as Partial<T>
      }

      const currentSnapshot = getVisibleRunStatus(prevState)
      const restored = chatUuid
        ? (prevState.runUiByChatUuid[chatUuid] ?? createInitialChatRunStatusState())
        : createInitialChatRunStatusState()

      return {
        ...restored,
        runUiByChatUuid: {
          ...prevState.runUiByChatUuid,
          [prevState.currentChatUuid]: currentSnapshot,
          ...(chatUuid ? { [chatUuid]: restored } : {})
        }
      } as Partial<T>
    }),
    setScrollHint: (hint) => set({ scrollHint: hint } as Partial<T>),
    clearScrollHint: () => set({ scrollHint: { type: 'none' } } as Partial<T>),
    setForceCompleteTypewriter: (fn) => set({ forceCompleteTypewriter: fn } as Partial<T>)
  }
}
