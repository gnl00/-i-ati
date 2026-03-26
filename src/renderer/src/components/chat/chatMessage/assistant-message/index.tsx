import React, { memo } from 'react'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'
import useChatSubmit from '@renderer/hooks/useChatSubmit'
import { ToolCallResultNextOutput } from './toolcall/ToolCallResultNextOutput'
import { useMessageTypewriter } from '../typewriter/use-message-typewriter'
import { MessageOperations } from '../message-operations'
import { ErrorMessage } from '../error-message'
import { CommandConfirmation } from './CommandConfirmation'
import { StreamingMarkdownSwitch } from '../typewriter/StreamingMarkdownSwitch'
import { toast } from 'sonner'
import { ModelBadgeNext } from './model-badge/ModelBadgeNext'
import { TextSegment } from './segments/TextSegment'
import { ReasoningSegmentNext } from './segments/ReasoningSegmentNext'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { shouldRenderAssistantMessageShell } from './assistant-message-visibility'

function getStreamingTextRenderMode(): 'markdown' | 'switch' {
  return (globalThis as any).__STREAMING_TEXT_RENDER_MODE ?? 'switch'
}

function getSegmentRenderKey(segment: MessageSegment, index: number): string {
  if (segment.type === 'toolCall' && segment.toolCallId) {
    return `tool-${segment.toolCallId}`
  }
  if (segment.type === 'error' && segment.error?.timestamp) {
    return `error-${segment.error.timestamp}`
  }
  const timestamp = (segment as { timestamp?: number }).timestamp
  if (timestamp) {
    return `${segment.type}-${timestamp}`
  }
  return `${segment.type}-${index}`
}

function resolveMessageProvider(
  modelRef: ModelRef | undefined,
  providerDefinitions: ProviderDefinition[],
  accounts: ProviderAccount[]
): string | undefined {
  if (!modelRef) return undefined

  const account = accounts.find(item => item.id === modelRef.accountId)
  if (!account) return undefined

  const definition = providerDefinitions.find(item => item.id === account.providerId)
  return definition?.iconKey || definition?.id || account.providerId
}

export interface AssistantMessageProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onCopyClick: (content: string) => void
  onTypingChange?: () => void
}

const extractRegeneratePayload = (
  message: ChatMessage
): { text: string; images: ClipbordImg[] } | null => {
  if (typeof message.content === 'string') {
    const text = message.content.trim()
    return text ? { text, images: [] } : null
  }

  if (!Array.isArray(message.content)) {
    return null
  }

  const textParts: string[] = []
  const images: ClipbordImg[] = []
  for (const item of message.content) {
    if (item.type === 'text' && item.text) {
      textParts.push(item.text)
    }
    if (item.type === 'image_url' && item.image_url?.url) {
      images.push(item.image_url.url)
    }
  }

  const text = textParts.join('\n').trim()
  if (!text && images.length === 0) {
    return null
  }
  return { text, images }
}

const getAssistantCopyContent = (message: ChatMessage): string => {
  const segmentText = (message.segments || [])
    .filter((segment): segment is TextSegment => segment.type === 'text')
    .map(segment => segment.content)
    .join('')
    .trim()

  if (segmentText) {
    return segmentText
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((item): item is VLMContent & { text: string } => item.type === 'text' && typeof item.text === 'string')
      .map(item => item.text)
      .join('\n')
      .trim()
  }

  return ''
}

/**
 * Assistant message component (left-aligned).
 * Supports segments: text (with typewriter), reasoning (collapsible), toolCall.
 */
export const AssistantMessage: React.FC<AssistantMessageProps> = memo(({
  index,
  message: m,
  isLatest,
  isHovered,
  onHover,
  onCopyClick,
  onTypingChange
}) => {
  const showLoadingIndicator = useChatStore(state => state.showLoadingIndicator)
  const messages = useChatStore(state => state.messages)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const readStreamState = useChatStore(state => state.readStreamState)
  const providerDefinitions = useAppConfigStore(state => state.providerDefinitions)
  const accounts = useAppConfigStore(state => state.accounts)
  const { onSubmit: handleChatSubmit } = useChatSubmit()

  const pendingToolConfirm = useToolConfirmationStore(state => state.pendingRequests[0] ?? null)
  const pendingToolConfirmCount = useToolConfirmationStore(state => state.pendingRequests.length)
  const confirm = useToolConfirmationStore(state => state.confirm)
  const cancel = useToolConfirmationStore(state => state.cancel)
  const isCommandConfirmPending = isLatest && pendingToolConfirm?.name === 'execute_command'

  const {
    segments,
    getSegmentVisibleLength,
    getVisibleTokens,
    shouldRenderSegment,
  } = useMessageTypewriter({
    index,
    message: m,
    isLatest,
    onTypingChange
  })

  if (!m || m.role !== 'assistant') return null

  const hasContent = typeof m.content === 'string'
    ? m.content.trim().length > 0
    : Array.isArray(m.content) && m.content.length > 0
  const hasSegments = Array.isArray(segments) && segments.length > 0
  const hasToolCalls = Array.isArray(m.toolCalls) && m.toolCalls.length > 0

  if (!shouldRenderAssistantMessageShell({
    hasContent,
    hasSegments,
    hasToolCalls,
    isCommandConfirmPending,
    isLatest,
    readStreamState,
    showLoadingIndicator
  })) {
    return null
  }

  const pendingCommand =
    pendingToolConfirm?.ui?.command ||
    ((pendingToolConfirm?.args as { command?: string } | undefined)?.command ?? '')

  const handleRegenerate = () => {
    if (readStreamState) {
      toast.warning('Please wait for current response to finish')
      return
    }
    if (!selectedModelRef) {
      toast.warning('Please select a model')
      return
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find(item => item.body.role === 'user' && !item.body.source)
      ?.body

    if (!lastUserMessage) {
      toast.warning('No user message available to regenerate')
      return
    }

    const payload = extractRegeneratePayload(lastUserMessage)
    if (!payload) {
      toast.warning('Last user message has no valid content to regenerate')
      return
    }

    void handleChatSubmit(payload.text, payload.images, {})
  }

  const modelProvider = resolveMessageProvider(m.modelRef, providerDefinitions, accounts)

  return (
    <div
      id={'assistant-message-' + index}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "flex justify-start flex-col",
        index === 0 ? 'mt-2' : '',
        isLatest && "animate-assistant-message-in"
      )}
    >
      <div>
        {/* Model Badge */}
        {m.model && (
          <ModelBadgeNext
            model={m.model}
            provider={modelProvider}
            animate={showLoadingIndicator && isLatest}
          />
        )}

        {/* Segments */}
        {segments.map((segment, segIdx) => {
          if (!shouldRenderSegment(segIdx)) return null

          const key = getSegmentRenderKey(segment, segIdx)

          if (segment.type === 'text') {
            const visibleTokenCount = getSegmentVisibleLength(segIdx)
            const isTyping = visibleTokenCount !== Infinity
            const visibleTokens = isTyping ? getVisibleTokens(segIdx) : undefined
            const hasCode = segment.content.includes('```') || segment.content.includes('`')

            if (hasCode) {
              const visibleText = visibleTokens ? visibleTokens.join('') : undefined
              return <TextSegment key={key} segment={segment} visibleText={visibleText} animateOnChange={false} />
            }

            const mode = getStreamingTextRenderMode()
            if (mode === 'markdown') {
              const visibleText = visibleTokens ? visibleTokens.join('') : undefined
              return (
                <TextSegment
                  key={key}
                  segment={segment}
                  visibleText={visibleText}
                  animateOnChange={isTyping}
                  transitionKey={visibleText}
                />
              )
            }

            const proseClassName =
              "prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-full prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300"
            return (
              <StreamingMarkdownSwitch
                key={key}
                text={segment.content}
                visibleTokens={visibleTokens}
                isTyping={isTyping}
                className={proseClassName}
              />
            )
          } else if (segment.type === 'reasoning') {
            const nextSegment = segments[segIdx + 1]
            const nextSegmentTimestamp =
              nextSegment && 'timestamp' in nextSegment && typeof nextSegment.timestamp === 'number'
                ? nextSegment.timestamp
                : undefined

            return (
              <ReasoningSegmentNext
                key={key}
                segment={segment}
                nextSegmentTimestamp={nextSegmentTimestamp}
                isStreaming={isLatest && showLoadingIndicator && segIdx === segments.length - 1}
              />
            )
          } else if (segment.type === 'toolCall') {
            return <ToolCallResultNextOutput key={key} toolCall={segment} index={index} />
          } else if (segment.type === 'error') {
            return <ErrorMessage key={key} error={segment.error} />
          }
          return null
        })}

        {/* Command Confirmation */}
        {isCommandConfirmPending && (
          <CommandConfirmation
            request={{
              command: pendingCommand,
              risk_level: pendingToolConfirm?.ui?.riskLevel || 'risky',
              execution_reason: pendingToolConfirm?.ui?.executionReason || pendingToolConfirm?.ui?.title || 'Command requires approval',
              possible_risk: pendingToolConfirm?.ui?.possibleRisk || pendingToolConfirm?.ui?.reason || 'Potential risk not provided',
              risk_score: pendingToolConfirm?.ui?.riskScore,
              agent: pendingToolConfirm?.agent,
              pending_count: pendingToolConfirmCount
            }}
            onConfirm={() => confirm(pendingToolConfirm.toolCallId)}
            onCancel={() => cancel('user abort', pendingToolConfirm.toolCallId)}
          />
        )}
      </div>

      {/* Operations */}
      <MessageOperations
        message={m}
        type="assistant"
        isHovered={isHovered}
        showRegenerate={isLatest}
        onCopyClick={() => onCopyClick(getAssistantCopyContent(m))}
        onRegenerateClick={handleRegenerate}
        onEditClick={() => {
          // TODO: 实现编辑助手消息功能
          console.log('Edit assistant message:', index)
        }}
      />
    </div>
  )
})
