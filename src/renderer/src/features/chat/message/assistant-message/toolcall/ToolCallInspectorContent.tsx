import { cn } from '@renderer/shared/lib/utils'
import { Check, Loader2, Wrench, X } from 'lucide-react'
import { useMemo } from 'react'
import { getReasonFromToolCall } from '../model/toolCallReason'
import { useChatStore } from '../../../state/chatStore'
import { buildToolLiveOutputKey } from '../../../state/chatRunUiStore'
import {
  getToolCallHeaderState,
  ToolCallDuration,
  ToolCallInspectorDetails
} from './ToolCallResult'

export function findSelectedToolCall(
  messages: MessageEntity[],
  previewMessage: MessageEntity | null,
  chatUuid: string,
  segmentId: string
): ToolCallSegment | undefined {
  const candidates = [
    ...messages.filter(message => !message.chatUuid || message.chatUuid === chatUuid),
    ...(previewMessage && (!previewMessage.chatUuid || previewMessage.chatUuid === chatUuid)
      ? [previewMessage]
      : [])
  ]

  for (let messageIndex = candidates.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const segments = candidates[messageIndex].body.segments ?? []
    for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
      const segment = segments[segmentIndex]
      if (segment.type === 'toolCall' && segment.segmentId === segmentId) {
        return segment
      }
    }
  }

  return undefined
}

const ToolInspectorEmptyState: React.FC<{
  title?: string
  description?: string
}> = ({
  title = 'Select a tool call',
  description = 'Choose a tool row in the conversation to inspect its parameters and result.'
}) => (
  <div className="flex h-full items-start justify-center px-8 pt-[24%] text-center" data-testid="tool-inspector-empty">
    <div className="max-w-[280px]">
      <span className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 bg-white/70 text-slate-500 dark:border-slate-800 dark:bg-white/[0.04] dark:text-slate-400">
        <Wrench className="h-4 w-4" />
      </span>
      <h3 className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>
    </div>
  </div>
)

const ToolInspectorMetadataId: React.FC<{
  id: string
  label: string
}> = ({ id, label }) => (
  <div className="flex min-w-0 items-center gap-1">
    <span className="shrink-0 text-[9px] text-zinc-400 dark:text-zinc-600">{label}</span>
    <code className="truncate text-[9px] text-zinc-500 dark:text-zinc-500" title={id}>
      {id}
    </code>
  </div>
)

export const ToolCallInspectorContent: React.FC = () => {
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const selection = useChatStore(state => state.toolCallInspectorSelection)
  const messages = useChatStore(state => state.messages)
  const previewMessage = useChatStore(state => state.preview.message)
  const toolCall = useMemo(() => {
    if (!currentChatUuid || selection?.chatUuid !== currentChatUuid) return undefined
    return findSelectedToolCall(
      messages,
      previewMessage,
      currentChatUuid,
      selection.segmentId
    )
  }, [currentChatUuid, messages, previewMessage, selection])
  const liveOutput = useChatStore(state => {
    if (
      !currentChatUuid
      || selection?.chatUuid !== currentChatUuid
      || !toolCall?.toolCallId
    ) {
      return undefined
    }
    return state.toolLiveOutputs[
      buildToolLiveOutputKey(currentChatUuid, toolCall.toolCallId)
    ]
  })

  if (!selection) return <ToolInspectorEmptyState />
  if (!currentChatUuid || selection.chatUuid !== currentChatUuid) {
    return (
      <ToolInspectorEmptyState
        title="Tool call belongs to another chat"
        description="Select a tool row in this conversation to update the inspector."
      />
    )
  }
  if (!toolCall) {
    return (
      <ToolInspectorEmptyState
        title="Tool call unavailable"
        description="The selected tool call is outside the current transcript."
      />
    )
  }

  const {
    toolResponse,
    isError,
    isPending,
    isRunning,
    statusLabel
  } = getToolCallHeaderState(toolCall)
  const reason = getReasonFromToolCall(toolCall)
  const StatusIcon = isError ? X : isRunning || isPending ? Loader2 : Check

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="tool-call-inspector">
      <header className="shrink-0 border-b border-black/6 bg-white/50 px-4 py-3 dark:border-white/8 dark:bg-white/2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex h-5 min-w-[72px] shrink-0 items-center justify-center gap-1 rounded-sm border px-1.5 text-[9px] font-medium capitalize',
                isError
                  ? 'border-red-200/80 bg-red-50/80 text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                  : isRunning || isPending
                    ? 'border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
                    : 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
              )}
            >
              <StatusIcon className={cn('h-3 w-3', isRunning && 'animate-spin motion-reduce:animate-none')} />
              <span>
                {statusLabel}
              </span>
            </span>
            <h2 className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
              {toolCall.name}
            </h2>
            <ToolCallDuration
              cost={toolCall.cost}
              isRunning={isRunning}
              runningStartedAt={toolCall.executionStartedAt ?? toolCall.timestamp}
              className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500"
            />
          </div>
          {reason && (
            <p className="mt-1.5 wrap-break-word text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {reason}
            </p>
          )}
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
            {toolCall.toolCallId && (
              <ToolInspectorMetadataId id={toolCall.toolCallId} label="call" />
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 custom-scrollbar">
        <ToolCallInspectorDetails
          key={toolCall.segmentId}
          toolCall={toolCall}
          toolResponse={toolResponse}
          liveOutput={liveOutput}
        />
      </div>
    </div>
  )
}
