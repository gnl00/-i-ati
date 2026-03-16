import type { AgentEventMapper, ConversationStore } from '@main/services/agentCore/contracts'
import type { AgentStepMessageManager } from '@main/services/agentCore/execution'
import type { StepArtifact } from '@main/services/agentCore/types'
import { ChatStepStore } from '../persistence'

const normalizeToolCallOrdering = (messages: ChatMessage[]): ChatMessage[] => {
  if (messages.length === 0) return messages

  const carried = new Map<string, IToolCall>()
  const normalized: ChatMessage[] = []
  const consumedToolIndexes = new Set<number>()

  const hasContent = (msg: ChatMessage): boolean => {
    if (typeof msg.content === 'string') {
      return msg.content.trim().length > 0
    }
    return Array.isArray(msg.content) && msg.content.length > 0
  }

  const snapshotToolCalls = (toolCalls: IToolCall[] | undefined): void => {
    if (!toolCalls || toolCalls.length === 0) return
    toolCalls.forEach(call => {
      if (call.id && !carried.has(call.id)) {
        carried.set(call.id, call)
      }
    })
  }

  const buildToolCall = (toolMessage: ChatMessage): IToolCall | null => {
    const toolCallId = toolMessage.toolCallId
    if (!toolCallId) return null
    const existing = carried.get(toolCallId)
    if (existing) return existing
    return {
      id: toolCallId,
      type: 'function',
      function: {
        name: toolMessage.name || 'unknown',
        arguments: '{}'
      }
    }
  }

  for (let i = 0; i < messages.length; i += 1) {
    if (consumedToolIndexes.has(i)) continue

    const message = messages[i]

    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const toolCallIds = message.toolCalls.map(call => call.id).filter(Boolean) as string[]
      const availableToolMessages = new Map<string, ChatMessage>()
      let j = i + 1
      while (j < messages.length) {
        const candidate = messages[j]
        if (candidate.role === 'user') break
        if (candidate.role === 'tool' && candidate.toolCallId && toolCallIds.includes(candidate.toolCallId)) {
          if (!availableToolMessages.has(candidate.toolCallId)) {
            availableToolMessages.set(candidate.toolCallId, candidate)
            consumedToolIndexes.add(j)
          }
        }
        j += 1
      }

      const filteredToolCalls = message.toolCalls.filter(call => call.id && availableToolMessages.has(call.id))
      const orderedToolMessages = filteredToolCalls
        .map(call => availableToolMessages.get(call.id as string))
        .filter(Boolean) as ChatMessage[]

      if (filteredToolCalls.length === 0) {
        snapshotToolCalls(message.toolCalls)
        const cleaned = { ...message, toolCalls: undefined }
        if (hasContent(cleaned)) normalized.push(cleaned)
      } else {
        normalized.push({ ...message, toolCalls: filteredToolCalls })
        normalized.push(...orderedToolMessages)
      }
      continue
    }

    if (message.role === 'tool') {
      const prev = normalized[normalized.length - 1]
      const prevHasToolCall = prev?.role === 'assistant' && prev.toolCalls?.some(call => call.id === message.toolCallId)
      if (prevHasToolCall) {
        normalized.push(message)
        continue
      }

      const batch: ChatMessage[] = []
      let j = i
      while (j < messages.length && messages[j].role === 'tool') {
        batch.push(messages[j])
        j += 1
      }

      const toolCalls: IToolCall[] = []
      for (const toolMessage of batch) {
        const call = buildToolCall(toolMessage)
        if (call) {
          toolCalls.push(call)
          carried.delete(call.id)
        }
      }

      if (toolCalls.length > 0) {
        normalized.push({
          role: 'assistant',
          content: '',
          segments: [],
          toolCalls
        })
      }

      normalized.push(...batch)
      i = j - 1
      continue
    }

    normalized.push(message)
  }

  return normalized
}

export class AssistantStepMessageManagerImpl implements AgentStepMessageManager {
  private lastUsage?: ITokenUsage
  private readonly artifacts: StepArtifact[] = []

  constructor(
    private readonly messageEntities: MessageEntity[],
    private readonly request: IUnifiedRequest,
    private readonly messageProjection: AgentEventMapper,
    private readonly chatId?: number,
    private readonly chatUuid?: string,
    private readonly chatStepStore: ConversationStore = new ChatStepStore()
  ) {}

  rebuildRequestMessages(): void {
    const bodies = normalizeToolCallOrdering(this.messageEntities.map(entity => entity.body))
    while (bodies.length > 0) {
      const last = bodies[bodies.length - 1]
      if (last.role !== 'assistant') break
      const hasToolCalls = last.toolCalls && last.toolCalls.length > 0
      const hasContent = typeof last.content === 'string'
        ? last.content.trim().length > 0
        : Array.isArray(last.content) && last.content.length > 0
      if (hasToolCalls || hasContent) break
      bodies.pop()
    }
    this.request.messages = bodies
  }

  updateLastAssistantMessage(updater: (message: MessageEntity) => MessageEntity): void {
    const index = this.findLastAssistantIndex()
    if (index < 0) throw new Error('No assistant message found')
    const updated = updater(this.messageEntities[index])
    this.messageEntities[index] = updated
    this.artifacts.push({
      kind: 'assistant_message_updated',
      messageId: updated.id,
      role: 'assistant',
      content: typeof updated.body.content === 'string' ? updated.body.content : '',
      segments: updated.body.segments || [],
      toolCalls: updated.body.toolCalls
    })
    this.messageProjection.emitMessageUpdated(updated)
  }

  getLastAssistantMessage(): MessageEntity {
    const index = this.findLastAssistantIndex()
    if (index < 0) throw new Error('No assistant message found')
    return this.messageEntities[index]
  }

  appendSegmentToLastMessage(segment: MessageSegment): void {
    this.updateLastAssistantMessage(message => {
      const segments = message.body.segments || []
      return {
        ...message,
        body: {
          ...message.body,
          segments: [...segments, segment]
        }
      }
    })
  }

  setLastUsage(usage: ITokenUsage): void {
    this.lastUsage = usage
  }

  getLastUsage(): ITokenUsage | undefined {
    return this.lastUsage
  }

  async addToolCallMessage(toolCalls: IToolCall[], content: string): Promise<void> {
    this.updateLastAssistantMessage(message => ({
      ...message,
      body: {
        ...message.body,
        content: content || message.body.content || '',
        toolCalls
      }
    }))
  }

  async addToolResultMessage(toolMsg: ChatMessage): Promise<void> {
    try {
      const entity = this.chatStepStore.persistToolResultMessage(
        toolMsg,
        this.chatId,
        this.chatUuid
      )
      this.artifacts.push({
        kind: 'tool_result_created',
        toolCallId: toolMsg.toolCallId || '',
        messageId: entity.id,
        message: entity.body
      })
      this.messageProjection.emitToolResultAttached(toolMsg.toolCallId || '', entity)
      this.messageEntities.push(entity)
    } catch (error) {
      console.warn('[ChatRun] Failed to persist tool result message', error)
    }
  }

  flushPendingAssistantUpdate(): void {
    this.rebuildRequestMessages()
  }

  getRequestMessages(): ChatMessage[] {
    return this.request.messages
  }

  getArtifacts(): StepArtifact[] {
    return [...this.artifacts]
  }

  private findLastAssistantIndex(): number {
    for (let i = this.messageEntities.length - 1; i >= 0; i -= 1) {
      if (this.messageEntities[i].body.role === 'assistant') {
        return i
      }
    }
    return -1
  }
}

export type AssistantStepMessageManagerImplLike = Pick<
  AssistantStepMessageManagerImpl,
  'flushPendingAssistantUpdate' | 'getLastAssistantMessage' | 'getLastUsage'
>
