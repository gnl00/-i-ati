import { create } from 'zustand'
import {
  createChatCoordinatorActions,
  type ChatCoordinatorActions
} from './chat/chatCoordinatorStore'
import {
  createChatSessionActions,
  createInitialChatSessionState,
  type ChatSessionActions,
  type ChatSessionState
} from './chat/chatSessionStore'
import {
  createChatTranscriptActions,
  createInitialChatTranscriptState,
  type ChatTranscriptActions,
  type ChatTranscriptState
} from './chat/chatTranscriptStore'
import {
  createChatRunUiActions,
  createInitialChatRunUiState,
  type ChatRunUiActions,
  type ChatRunUiState
} from './chat/chatRunUiStore'
import {
  createChatViewActions,
  createInitialChatViewState,
  type ChatViewActions,
  type ChatViewState
} from './chat/chatViewStore'
export type {
  ChatSessionState,
  ChatSessionActions
} from './chat/chatSessionStore'
export type {
  ChatCoordinatorActions
} from './chat/chatCoordinatorStore'
export type {
  RunPhase,
  PostRunJobStatus,
  PostRunJobsState,
  RunOutcome,
  ChatRunScrollHint,
  ChatRunUiState,
  ChatRunUiActions
} from './chat/chatRunUiStore'

export type ChatState = ChatSessionState & ChatTranscriptState & ChatRunUiState & ChatViewState

export type ChatAction =
  & ChatCoordinatorActions
  & ChatSessionActions
  & ChatTranscriptActions
  & ChatRunUiActions
  & ChatViewActions

export const useChatStore = create<ChatState & ChatAction>((set, get) => ({
  // Chat state
  ...createInitialChatSessionState(),
  ...createInitialChatTranscriptState(),
  ...createInitialChatRunUiState(),
  ...createInitialChatViewState(),

  // ============ UI 状态更新方法 ============

  ...createChatSessionActions(set, get),
  ...createChatRunUiActions(set),
  ...createChatViewActions(set),

  ...createChatTranscriptActions(set, get),
  ...createChatCoordinatorActions(set, get),

}))
export type ChatStore = ChatState & ChatAction
