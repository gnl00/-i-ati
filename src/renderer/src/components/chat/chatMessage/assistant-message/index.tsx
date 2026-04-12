import React, { memo } from 'react'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'
import useChatRun from '@renderer/hooks/useChatRun'
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
import {
  shouldRenderAssistantMessageShell,
  shouldShowAssistantMessageOperations
} from './assistant-message-visibility'

function getStreamingTextRenderMode(): 'markdown' | 'switch' {
  return (globalThis as any).__STREAMING_TEXT_RENDER_MODE ?? 'switch'
}

const EMPTY_PREVIEW_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: '',
  segments: [],
  source: 'stream_preview',
  typewriterCompleted: true
}

type SegmentRenderLayer = 'committed' | 'preview'

type SegmentRenderItem = {
  key: string
  layer: SegmentRenderLayer
  sourceIndex: number
  segment: MessageSegment
}

type SupportSegmentRenderItem = SegmentRenderItem & {
  isStreamingTail: boolean
}

type OrderedSegmentRenderItem =
  | { kind: 'text'; item: SegmentRenderItem }
  | { kind: 'support'; item: SupportSegmentRenderItem }

function getSegmentRenderKey(segment: MessageSegment, index: number): string {
  if ('segmentId' in segment && typeof segment.segmentId === 'string' && segment.segmentId) {
    return segment.segmentId
  }
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

function isEmotionToolName(name: string | undefined): boolean {
  return name === 'emotion_report'
}

function isEmotionToolSegment(segment: MessageSegment): boolean {
  if (segment.type !== 'toolCall') return false
  const toolName = typeof segment.content?.toolName === 'string' ? segment.content.toolName : segment.name
  return isEmotionToolName(toolName)
}

function getEmotionEmoji(message: ChatMessage): string | undefined {
  const unifiedEmotionEmoji = message.emotion?.emoji?.trim()
  if (unifiedEmotionEmoji) {
    return unifiedEmotionEmoji
  }

  const segments = Array.isArray(message.segments) ? message.segments : []

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (!isEmotionToolSegment(segment)) continue
    if (segment.type !== 'toolCall') continue
    if (segment.isError) continue

    const result = segment.content?.result
    const emoji = typeof result?.emoji === 'string'
      ? result.emoji.trim()
      : typeof segment.content?.emoji === 'string'
        ? segment.content.emoji.trim()
        : ''

    if (emoji) return emoji
  }

  return undefined
}

function getEmotionLabel(message: ChatMessage): string | undefined {
  const unifiedEmotionLabel = message.emotion?.label?.trim()
  if (unifiedEmotionLabel) {
    return unifiedEmotionLabel
  }

  const segments = Array.isArray(message.segments) ? message.segments : []

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (!isEmotionToolSegment(segment)) continue
    if (segment.type !== 'toolCall') continue
    if (segment.isError) continue

    const result = segment.content?.result
    const label = typeof result?.label === 'string'
      ? result.label.trim()
      : typeof segment.content?.label === 'string'
        ? segment.content.label.trim()
        : ''

    if (label) return label
  }

  return undefined
}

function getEmotionIntensity(message: ChatMessage): number | undefined {
  if (typeof message.emotion?.intensity === 'number') {
    return message.emotion.intensity
  }

  const segments = Array.isArray(message.segments) ? message.segments : []

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (!isEmotionToolSegment(segment)) continue
    if (segment.type !== 'toolCall') continue
    if (segment.isError) continue

    const result = segment.content?.result
    const intensity = typeof result?.intensity === 'number'
      ? result.intensity
      : typeof segment.content?.intensity === 'number'
        ? segment.content.intensity
        : undefined

    if (typeof intensity === 'number') return intensity
  }

  return undefined
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

const areSupportSegmentRenderItemsEqual = (
  previous: SupportSegmentRenderItem[],
  next: SupportSegmentRenderItem[]
): boolean => {
  if (previous.length !== next.length) return false

  return previous.every((item, index) => {
    const nextItem = next[index]
    return item.key === nextItem.key
      && item.layer === nextItem.layer
      && item.sourceIndex === nextItem.sourceIndex
      && item.segment === nextItem.segment
      && item.isStreamingTail === nextItem.isStreamingTail
  })
}

const AssistantSupportSegmentRow = memo(({
  item
}: {
  item: SupportSegmentRenderItem
}) => {
  const { segment, key, isStreamingTail } = item

  if (segment.type === 'reasoning') {
    return (
      <ReasoningSegmentNext
        key={key}
        segment={segment}
        isStreaming={isStreamingTail}
      />
    )
  }

  if (segment.type === 'toolCall') {
    return <ToolCallResultNextOutput key={key} toolCall={segment} index={item.sourceIndex} />
  }

  if (segment.type === 'error') {
    return <ErrorMessage key={key} error={segment.error} />
  }

  return null
}, (prevProps, nextProps) => areSupportSegmentRenderItemsEqual([prevProps.item], [nextProps.item]))

const AssistantTextSegmentRow = memo(({
  item,
  typewriter,
  isOverlayPreview
}: {
  item: SegmentRenderItem
  typewriter: ReturnType<typeof useMessageTypewriter>
  isOverlayPreview: boolean
}) => {
  const { segment, key, layer, sourceIndex } = item
  if (segment.type !== 'text') return null

  const isTypedLayer = layer === 'preview' || !isOverlayPreview
  if (isTypedLayer && !typewriter.shouldRenderSegment(sourceIndex)) {
    return null
  }

  const visibleTokenCount = isTypedLayer ? typewriter.getSegmentVisibleLength(sourceIndex) : Infinity
  const isTyping = visibleTokenCount !== Infinity
  const visibleTokens = isTyping ? typewriter.getVisibleTokens(sourceIndex) : undefined
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
    'prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-full prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300'

  return (
    <StreamingMarkdownSwitch
      key={key}
      text={segment.content}
      visibleTokens={visibleTokens}
      isTyping={isTyping}
      className={proseClassName}
    />
  )
})

export interface AssistantMessageProps {
  index: number
  message: ChatMessage
  previewMessage?: ChatMessage
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
  previewMessage,
  isLatest,
  isHovered,
  onHover,
  onCopyClick,
  onTypingChange
}) => {
  const runPhase = useChatStore(state => state.runPhase)
  const messages = useChatStore(state => state.messages)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const providerDefinitions = useAppConfigStore(state => state.providerDefinitions)
  const accounts = useAppConfigStore(state => state.accounts)
  const { onSubmit: handleChatSubmit } = useChatRun()

  const pendingToolConfirm = useToolConfirmationStore(state => state.pendingRequests[0] ?? null)
  const pendingToolConfirmCount = useToolConfirmationStore(state => state.pendingRequests.length)
  const confirm = useToolConfirmationStore(state => state.confirm)
  const cancel = useToolConfirmationStore(state => state.cancel)
  const isCommandConfirmPending = isLatest && pendingToolConfirm?.name === 'execute_command'
  const isOverlayPreview = Boolean(previewMessage)
  const badgeMessage: ChatMessage = previewMessage
    ? {
        ...m,
        ...previewMessage,
        emotion: previewMessage.emotion ?? m.emotion,
        segments: [...(m.segments || []), ...(previewMessage.segments || [])]
      }
    : m

  const committedTypewriter = useMessageTypewriter({
    index,
    message: m,
    isLatest,
    onTypingChange
  })
  const previewTypewriter = useMessageTypewriter({
    index,
    message: previewMessage ?? EMPTY_PREVIEW_MESSAGE,
    isLatest,
    onTypingChange
  })

  if (!m || m.role !== 'assistant') return null

  const isRunBusy = runPhase !== 'idle'
  const isAssistantResponseActive = runPhase === 'submitting' || runPhase === 'streaming'
  const isStreaming = runPhase === 'streaming'

  const buildSegmentItems = (
    segments: MessageSegment[],
    layer: SegmentRenderLayer,
    typewriter: ReturnType<typeof useMessageTypewriter>
  ): OrderedSegmentRenderItem[] => {
    const orderedItems: OrderedSegmentRenderItem[] = []

    segments.forEach((segment, sourceIndex) => {
      if (isEmotionToolSegment(segment)) return

      const key = `${layer}-${getSegmentRenderKey(segment, sourceIndex)}`

      if (segment.type === 'text') {
        orderedItems.push({
          kind: 'text',
          item: {
            key,
            layer,
            sourceIndex,
            segment
          }
        })
        return
      }

      orderedItems.push({
        kind: 'support',
        item: {
          key,
          layer,
          sourceIndex,
          segment,
          isStreamingTail: layer === 'preview' && isLatest && isStreaming && sourceIndex === typewriter.segments.length - 1
        }
      })
    })

    return orderedItems
  }

  const committedItems = buildSegmentItems(committedTypewriter.segments, 'committed', committedTypewriter)
  const previewItems = isOverlayPreview
    ? buildSegmentItems(previewTypewriter.segments, 'preview', previewTypewriter)
    : []
  const hasVisibleToolCalls = Array.isArray((previewMessage ?? m).toolCalls)
    && (previewMessage ?? m).toolCalls!.some(call => !isEmotionToolName(call.function?.name))
  const emotionLabel = getEmotionLabel(badgeMessage)
  const emotionEmoji = getEmotionEmoji(badgeMessage)
  const emotionIntensity = getEmotionIntensity(badgeMessage)

  const hasCommittedContent = typeof m.content === 'string'
    ? m.content.trim().length > 0
    : Array.isArray(m.content) && m.content.length > 0
  const hasPreviewContent = typeof previewMessage?.content === 'string'
    ? previewMessage.content.trim().length > 0
    : Array.isArray(previewMessage?.content) && previewMessage.content.length > 0
  const hasContent = hasCommittedContent || hasPreviewContent
  const hasSegments =
    committedItems.length > 0
    || previewItems.length > 0
  const hasToolCalls = hasVisibleToolCalls

  if (!shouldRenderAssistantMessageShell({
    hasContent,
    hasSegments,
    hasToolCalls,
    isCommandConfirmPending,
    isLatest,
    isResponseActive: isAssistantResponseActive
  })) {
    return null
  }

  const pendingCommand =
    pendingToolConfirm?.ui?.command ||
    ((pendingToolConfirm?.args as { command?: string } | undefined)?.command ?? '')

  const handleRegenerate = () => {
    if (isRunBusy) {
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

  const modelProvider = resolveMessageProvider((previewMessage ?? m).modelRef, providerDefinitions, accounts)
  const badgeModel = (previewMessage ?? m).model

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
        {badgeModel && (
          <ModelBadgeNext
            model={badgeModel}
            provider={modelProvider}
            animate={isAssistantResponseActive && isLatest}
            emotionLabel={emotionLabel}
            emotionEmoji={emotionEmoji}
            emotionIntensity={emotionIntensity}
          />
        )}

        {/* Segments */}
        {committedItems.map((entry) => (
          entry.kind === 'text'
            ? (
              <AssistantTextSegmentRow
                key={entry.item.key}
                item={entry.item}
                typewriter={committedTypewriter}
                isOverlayPreview={isOverlayPreview}
              />
            )
            : <AssistantSupportSegmentRow key={entry.item.key} item={entry.item} />
        ))}
        {previewItems.map((entry) => (
          entry.kind === 'text'
            ? (
              <AssistantTextSegmentRow
                key={entry.item.key}
                item={entry.item}
                typewriter={previewTypewriter}
                isOverlayPreview={isOverlayPreview}
              />
            )
            : <AssistantSupportSegmentRow key={entry.item.key} item={entry.item} />
        ))}

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
      {shouldShowAssistantMessageOperations({
        messageSource: m.source,
        hasPreviewMessage: isOverlayPreview
      }) && (
        <MessageOperations
          message={m}
          type="assistant"
          isHovered={isHovered}
          showRegenerate={isLatest}
          onCopyClick={() => onCopyClick(getAssistantCopyContent(previewMessage ?? m))}
          onRegenerateClick={handleRegenerate}
          onEditClick={() => {
            // TODO: 实现编辑助手消息功能
            console.log('Edit assistant message:', index)
          }}
        />
      )}
    </div>
  )
})
