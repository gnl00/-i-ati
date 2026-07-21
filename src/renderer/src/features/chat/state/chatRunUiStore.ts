import type { ToolOutputBatch } from '@shared/run/tool-events'

export type RunPhase = 'idle' | 'submitting' | 'streaming' | 'post_run' | 'cancelling'
export type PostRunJobStatus = 'idle' | 'pending' | 'failed'
export type PostRunJobsState = {
  title: PostRunJobStatus
  compression: PostRunJobStatus
}
export type RunOutcome = 'idle' | 'completed' | 'failed' | 'aborted'
export type ToolLiveOutput = {
  submissionId: string
  sequence: number
  stdout: string
  stderr: string
  stdoutBytes: number
  stderrBytes: number
  stdoutPendingCarriageReturn?: boolean
  stderrPendingCarriageReturn?: boolean
}

const TOOL_LIVE_OUTPUT_MAX_BYTES = 64 * 1024
const TOOL_LIVE_OUTPUT_UNSCOPED_CHAT = '__unscoped__'

export function buildToolLiveOutputKey(
  chatUuid: string | null | undefined,
  toolCallId: string
): string {
  return `${chatUuid || TOOL_LIVE_OUTPUT_UNSCOPED_CHAT}:${toolCallId}`
}

export function trimToolLiveOutputTail(
  text: string,
  maxBytes = TOOL_LIVE_OUTPUT_MAX_BYTES
): string {
  const encoder = new TextEncoder()
  if (encoder.encode(text).byteLength <= maxBytes) {
    return text
  }

  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (encoder.encode(text.slice(middle)).byteLength > maxBytes) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  if (
    low > 0
    && low < text.length
    && text.charCodeAt(low) >= 0xDC00
    && text.charCodeAt(low) <= 0xDFFF
    && text.charCodeAt(low - 1) >= 0xD800
    && text.charCodeAt(low - 1) <= 0xDBFF
  ) {
    low += 1
  }
  return text.slice(low)
}

export function appendTerminalOutput(
  previous: string,
  chunk: string,
  pendingCarriageReturn = false
): { text: string; pendingCarriageReturn: boolean } {
  let text = previous
  let index = 0

  const replaceCurrentLine = (): void => {
    const lineStart = text.lastIndexOf('\n') + 1
    text = text.slice(0, lineStart)
  }

  if (pendingCarriageReturn && chunk.startsWith('\n')) {
    text += '\n'
    index = 1
    pendingCarriageReturn = false
  } else if (pendingCarriageReturn && chunk.length > 0) {
    replaceCurrentLine()
    pendingCarriageReturn = false
  }

  while (index < chunk.length) {
    const character = chunk[index]
    if (character !== '\r') {
      text += character
      index += 1
      continue
    }

    if (index + 1 >= chunk.length) {
      pendingCarriageReturn = true
      break
    }
    if (chunk[index + 1] === '\n') {
      text += '\n'
      index += 2
      continue
    }

    replaceCurrentLine()
    index += 1
  }

  return {
    text: trimToolLiveOutputTail(text),
    pendingCarriageReturn
  }
}

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
  toolLiveOutputs: Record<string, ToolLiveOutput>
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
  appendToolLiveOutput: (
    batch: ToolOutputBatch,
    submissionId: string,
    chatUuid?: string | null
  ) => void
  clearToolLiveOutput: (
    toolCallId: string,
    submissionId: string,
    chatUuid?: string | null
  ) => void
  clearToolLiveOutputs: (submissionId?: string) => void
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
  forceCompleteTypewriter: null,
  toolLiveOutputs: {}
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
    getRunStatusForChat: (chatUuid): ChatRunStatusState => {
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
    setForceCompleteTypewriter: (fn) => set({ forceCompleteTypewriter: fn } as Partial<T>),
    appendToolLiveOutput: (batch, submissionId, chatUuid) => set((prevState) => {
      const outputKey = buildToolLiveOutputKey(chatUuid, batch.toolCallId)
      const previous = prevState.toolLiveOutputs[outputKey]
      const previousFromSameSubmission = previous?.submissionId === submissionId
        ? previous
        : undefined
      if (previousFromSameSubmission && batch.sequence <= previousFromSameSubmission.sequence) {
        return prevState as Partial<T>
      }

      const nextStdout = batch.chunks
        .filter(chunk => chunk.stream === 'stdout')
        .reduce(
          (output, chunk) => appendTerminalOutput(
            output.text,
            chunk.text,
            output.pendingCarriageReturn
          ),
          {
            text: previousFromSameSubmission?.stdout ?? '',
            pendingCarriageReturn:
              previousFromSameSubmission?.stdoutPendingCarriageReturn ?? false
          }
        )
      const nextStderr = batch.chunks
        .filter(chunk => chunk.stream === 'stderr')
        .reduce(
          (output, chunk) => appendTerminalOutput(
            output.text,
            chunk.text,
            output.pendingCarriageReturn
          ),
          {
            text: previousFromSameSubmission?.stderr ?? '',
            pendingCarriageReturn:
              previousFromSameSubmission?.stderrPendingCarriageReturn ?? false
          }
        )

      return {
        toolLiveOutputs: {
          ...prevState.toolLiveOutputs,
          [outputKey]: {
            submissionId,
            sequence: batch.sequence,
            stdout: nextStdout.text,
            stderr: nextStderr.text,
            stdoutBytes: batch.stdoutBytes,
            stderrBytes: batch.stderrBytes,
            stdoutPendingCarriageReturn: nextStdout.pendingCarriageReturn,
            stderrPendingCarriageReturn: nextStderr.pendingCarriageReturn
          }
        }
      } as Partial<T>
    }),
    clearToolLiveOutput: (toolCallId, submissionId, chatUuid) => set((prevState) => {
      const outputKey = buildToolLiveOutputKey(chatUuid, toolCallId)
      if (prevState.toolLiveOutputs[outputKey]?.submissionId !== submissionId) {
        return prevState as Partial<T>
      }
      const toolLiveOutputs = { ...prevState.toolLiveOutputs }
      delete toolLiveOutputs[outputKey]
      return { toolLiveOutputs } as Partial<T>
    }),
    clearToolLiveOutputs: (submissionId) => set((prevState) => {
      if (!submissionId) {
        return { toolLiveOutputs: {} } as Partial<T>
      }
      return {
        toolLiveOutputs: Object.fromEntries(
          Object.entries(prevState.toolLiveOutputs)
            .filter(([, output]) => output.submissionId !== submissionId)
        )
      } as Partial<T>
    })
  }
}
