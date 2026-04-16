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

export function buildAssistantMessageLayoutModels(
  input: BuildAssistantMessageLayoutModelsInput
): AssistantMessageLayoutModels {
  return {
    shell: {
      index: input.index,
      isLatest: input.isLatest,
      onHover: input.onHover
    },
    header: {
      header: input.headerProjection,
      badgeAnimate: input.badgeAnimate
    },
    body: {
      index: input.index,
      isLatest: input.isLatest,
      onTypingChange: input.onTypingChange,
      transcript: input.transcriptProjection,
      textPlayback: input.textPlayback,
      commandConfirmationRequest: input.commandState.commandConfirmationRequest,
      onConfirmCommand: input.onConfirmCommand,
      onCancelCommand: input.onCancelCommand
    },
    footer: {
      committedMessage: input.committedMessage,
      isHovered: input.isHovered,
      showOperations: input.footerState.showOperations,
      showRegenerate: input.footerState.showRegenerate,
      onCopyClick: input.onCopyClick,
      onRegenerateClick: input.onRegenerateClick,
      onEditClick: input.onEditClick
    }
  }
}
