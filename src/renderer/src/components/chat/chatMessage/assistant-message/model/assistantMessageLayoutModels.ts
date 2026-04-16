import type { AssistantMessageBodyModel } from '../AssistantMessageBody'
import type { AssistantMessageFooterActionsModel } from '../AssistantMessageFooterActions'
import type { AssistantMessageHeaderModel } from '../AssistantMessageHeader'
import type { AssistantMessageShellModel } from '../AssistantMessageLayout'
import type { AssistantMessageCommandState } from './assistantMessageCommandState'
import type { AssistantMessageFooterState } from './assistantMessageFooterState'
import type { AssistantMessageHeaderProjection, AssistantMessageTranscriptProjection } from './assistantMessageMapper'
import type { AssistantMessageTextPlaybackModel } from './assistantMessageTextPlayback'

export interface BuildAssistantMessageLayoutModelsInput {
  index: number
  isLatest: boolean
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onTypingChange?: () => void
  committedMessage: ChatMessage
  headerProjection: AssistantMessageHeaderProjection
  transcriptProjection: AssistantMessageTranscriptProjection
  textPlayback: AssistantMessageTextPlaybackModel
  commandState: AssistantMessageCommandState
  footerState: AssistantMessageFooterState
  badgeAnimate: boolean
  onCopyClick: () => void
  onRegenerateClick: () => void
  onEditClick: () => void
  onConfirmCommand: () => void
  onCancelCommand: () => void
}

export interface AssistantMessageLayoutModels {
  shell: AssistantMessageShellModel
  header: AssistantMessageHeaderModel
  body: AssistantMessageBodyModel
  footer: AssistantMessageFooterActionsModel
}

export function buildAssistantMessageShellModel(
  input: Pick<BuildAssistantMessageLayoutModelsInput, 'index' | 'isLatest' | 'onHover'>
): AssistantMessageShellModel {
  return {
    index: input.index,
    isLatest: input.isLatest,
    onHover: input.onHover
  }
}

export function buildAssistantMessageHeaderModel(
  input: Pick<BuildAssistantMessageLayoutModelsInput, 'headerProjection' | 'badgeAnimate'>
): AssistantMessageHeaderModel {
  return {
    header: input.headerProjection,
    badgeAnimate: input.badgeAnimate
  }
}

export function buildAssistantMessageBodyModel(
  input: Pick<
    BuildAssistantMessageLayoutModelsInput,
    | 'index'
    | 'isLatest'
    | 'onTypingChange'
    | 'transcriptProjection'
    | 'textPlayback'
    | 'commandState'
    | 'onConfirmCommand'
    | 'onCancelCommand'
  >
): AssistantMessageBodyModel {
  return {
    index: input.index,
    isLatest: input.isLatest,
    onTypingChange: input.onTypingChange,
    transcript: input.transcriptProjection,
    textPlayback: input.textPlayback,
    commandConfirmationRequest: input.commandState.commandConfirmationRequest,
    onConfirmCommand: input.onConfirmCommand,
    onCancelCommand: input.onCancelCommand
  }
}

export function buildAssistantMessageFooterModel(
  input: Pick<
    BuildAssistantMessageLayoutModelsInput,
    | 'committedMessage'
    | 'isHovered'
    | 'footerState'
    | 'onCopyClick'
    | 'onRegenerateClick'
    | 'onEditClick'
  >
): AssistantMessageFooterActionsModel {
  return {
    messageMeta: input.committedMessage.createdAt == null
      ? undefined
      : { createdAt: input.committedMessage.createdAt },
    isHovered: input.isHovered,
    showOperations: input.footerState.showOperations,
    showRegenerate: input.footerState.showRegenerate,
    onCopyClick: input.onCopyClick,
    onRegenerateClick: input.onRegenerateClick,
    onEditClick: input.onEditClick
  }
}

export function buildAssistantMessageLayoutModels(
  input: BuildAssistantMessageLayoutModelsInput
): AssistantMessageLayoutModels {
  return {
    shell: buildAssistantMessageShellModel(input),
    header: buildAssistantMessageHeaderModel(input),
    body: buildAssistantMessageBodyModel(input),
    footer: buildAssistantMessageFooterModel(input)
  }
}
