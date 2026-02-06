import { ChatSubmitEventEmitter } from './event-emitter'
import { toolConfirmationManager } from './tool-confirmation'
import { ChunkParser } from './streaming/parser'
import { StreamingOrchestrator } from './streaming/orchestrator'
import type {
  StreamingOrchestratorContext,
  StreamingOrchestratorDeps
} from './streaming/orchestrator'
import { ToolExecutor } from './streaming/executor'
import type { ToolExecutionProgress } from './streaming/executor/types'
import type { ToolCall } from './types'
import { AbortError, DuplicateSubmissionIdError } from './errors'
import DatabaseService from '../DatabaseService'
import { systemPrompt as systemPromptBuilder } from '@shared/prompts'
import { buildSkillsPrompt } from '@shared/services/skills/SkillPromptBuilder'
import { RequestMessageBuilder } from '@shared/services/RequestMessageBuilder'
import { embeddedToolsRegistry } from '@tools/registry'
import { SkillService } from '../skills/SkillService'

type MainChatSubmitInput = {
  submissionId: string
  input: {
    textCtx: string
    mediaCtx: ClipbordImg[] | string[]
    tools?: any[]
    prompt?: string
    options?: IUnifiedRequest['options']
    stream?: boolean
  }
  modelRef: ModelRef
  persistMessages?: boolean
  chatId?: number
  chatUuid?: string
}

type MainChatSubmitResult = {
  assistantMessageId?: number
}

type ActiveSubmission = {
  controller: AbortController
  emitter: ChatSubmitEventEmitter
}

class MainStreamingMessageManager {
  private lastUsage?: ITokenUsage

  constructor(
    private readonly messageEntities: MessageEntity[],
    private readonly request: IUnifiedRequest,
    private readonly emitter: ChatSubmitEventEmitter,
    private readonly chatId?: number,
    private readonly chatUuid?: string,
    private readonly allowEarlyPersist?: boolean
  ) {}

  rebuildRequestMessages(): void {
    const bodies = normalizeToolCallOrdering(
      this.messageEntities.map(entity => entity.body)
    )
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
    if (index < 0) {
      const placeholder: MessageEntity = {
        body: {
          role: 'assistant',
          content: '',
          segments: [],
          typewriterCompleted: false
        }
      }
      this.messageEntities.push(placeholder)
      this.messageEntities[this.messageEntities.length - 1] = updater(placeholder)
    } else {
      this.messageEntities[index] = updater(this.messageEntities[index])
    }
  }

  getLastAssistantMessage(): MessageEntity {
    const index = this.findLastAssistantIndex()
    if (index < 0) {
      throw new Error('No assistant message found')
    }
    return this.messageEntities[index]
  }

  appendSegmentToLastMessage(segment: MessageSegment): void {
    this.updateLastAssistantMessage((message) => {
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
    this.ensureAssistantTail()
    this.updateLastAssistantMessage((message) => ({
      ...message,
      body: {
        ...message.body,
        content: content || message.body.content || '',
        toolCalls
      }
    }))
    if (this.allowEarlyPersist) {
      this.ensureAssistantPersisted()
    }

    this.emitter.emit('tool.call.attached', {
      toolCallIds: toolCalls.map(call => call.id).filter(Boolean),
      messageId: this.getLastAssistantMessage().id
    })
  }

  async addToolResultMessage(toolMsg: ChatMessage): Promise<void> {
    const entity: MessageEntity = {
      body: toolMsg,
      chatId: this.chatId,
      chatUuid: this.chatUuid
    }

    let saved = false
    try {
      const msgId = DatabaseService.saveMessage(entity)
      entity.id = msgId
      saved = true
    } catch (error) {
      // keep entity without id for UI/debug purposes
    }

    this.messageEntities.push(entity)
    this.emitter.emit('tool.result.attached', {
      toolCallId: toolMsg.toolCallId || '',
      message: entity
    })

    if (saved) {
      this.emitter.emit('tool.result.persisted', {
        toolCallId: toolMsg.toolCallId || '',
        message: entity
      })
    }
  }

  flushPendingAssistantUpdate(): void {
    this.rebuildRequestMessages()
  }

  private findLastAssistantIndex(): number {
    for (let i = this.messageEntities.length - 1; i >= 0; i--) {
      if (this.messageEntities[i].body.role === 'assistant') {
        return i
      }
    }
    return -1
  }

  private ensureAssistantTail(): void {
    const last = this.messageEntities[this.messageEntities.length - 1]
    if (last?.body?.role === 'assistant') {
      return
    }

    this.messageEntities.push({
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    })
  }

  private ensureAssistantPersisted(): void {
    const last = this.messageEntities[this.messageEntities.length - 1]
    if (!last || last.body.role !== 'assistant') return
    if (last.id) return
    if (!this.chatId && !this.chatUuid) return

    try {
      const msgId = DatabaseService.saveMessage({
        body: last.body,
        chatId: this.chatId,
        chatUuid: this.chatUuid
      })
      last.id = msgId
    } catch {
      // ignore persistence errors; final persist will retry
    }
  }
}

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
    if (consumedToolIndexes.has(i)) {
      continue
    }
    const message = messages[i]

    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const toolCallIds = message.toolCalls.map(call => call.id).filter(Boolean) as string[]
      const availableToolMessages = new Map<string, ChatMessage>()
      let j = i + 1
      while (j < messages.length) {
        const candidate = messages[j]
        if (candidate.role === 'user') {
          break
        }
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
        if (hasContent(cleaned)) {
          normalized.push(cleaned)
        }
      } else {
        normalized.push({ ...message, toolCalls: filteredToolCalls })
        normalized.push(...orderedToolMessages)
      }
      continue
    }

    if (message.role === 'tool') {
      if (consumedToolIndexes.has(i)) {
        continue
      }
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

export class MainChatSubmitService {
  private active = new Map<string, ActiveSubmission>()

  async submit(input: MainChatSubmitInput): Promise<MainChatSubmitResult> {
    if (this.active.has(input.submissionId)) {
      throw new DuplicateSubmissionIdError(input.submissionId)
    }

    const chat = this.resolveChatEntity(input.chatId, input.chatUuid)
    if (input.chatId && chat.id && input.chatId !== chat.id) {
      console.warn('[ChatSubmit] input.chatId mismatch resolved chat.id', {
        inputChatId: input.chatId,
        resolvedChatId: chat.id,
        inputChatUuid: input.chatUuid,
        resolvedChatUuid: chat.uuid
      })
    }

    const controller = new AbortController()
    const emitter = new ChatSubmitEventEmitter({
      submissionId: input.submissionId,
      chatId: chat.id,
      chatUuid: chat.uuid
    })

    this.active.set(input.submissionId, { controller, emitter })

    const request = await this.buildRequest(input)
    const messageEntities = request.messages.map(body => ({ body }))
    this.ensureAssistantPlaceholder(messageEntities, request)

    const context: StreamingOrchestratorContext = {
      request,
      meta: {
        model: {
          id: request.model,
          label: request.model,
          type: (request.modelType as ModelType) || 'llm'
        }
      },
      streaming: {
        tools: []
      },
      session: {
        chatEntity: chat
      },
      control: {
        signal: controller.signal
      }
    }

    const deps: StreamingOrchestratorDeps = {
      beforeFetch: () => {},
      afterFetch: () => {}
    }

    const parser = new ChunkParser()
    const messageManager = new MainStreamingMessageManager(
      messageEntities,
      request,
      emitter,
      chat.id,
      chat.uuid,
      Boolean(input.persistMessages)
    )

    const toolExecutor = new ToolExecutor({
      maxConcurrency: 3,
      signal: controller.signal,
      chatUuid: chat.uuid,
      requestConfirmation: (request) => toolConfirmationManager.request(emitter, request),
      onProgress: (progress: ToolExecutionProgress) => {
        if (progress.phase === 'started') {
          emitter.emit('tool.exec.started', {
            toolCallId: progress.id,
            name: progress.name
          })
          return
        }
        if (progress.phase === 'completed') {
          emitter.emit('tool.exec.completed', {
            toolCallId: progress.id,
            result: progress.result?.content,
            cost: progress.result?.cost || 0
          })
          return
        }
        if (progress.phase === 'failed') {
          emitter.emit('tool.exec.failed', {
            toolCallId: progress.id,
            error: progress.result?.error || new Error('Tool execution failed')
          })
        }
      }
    })

    const orchestrator = new StreamingOrchestrator({
      context,
      deps,
      parser,
      messageManager,
      signal: controller.signal,
      toolConfirmationHandler: (request) => toolConfirmationManager.request(emitter, request),
      callbacks: {
        onPhaseChange: () => {}
      },
      events: {
        onChunk: (result) => {
          if (!result.contentDelta && !result.reasoningDelta) {
            return
          }
          emitter.emit('stream.chunk', {
            contentDelta: result.contentDelta,
            reasoningDelta: result.reasoningDelta
          })
        },
        onToolCallsDetected: (toolCalls: ToolCall[]) => {
          for (const toolCall of toolCalls) {
            emitter.emit('tool.call.detected', { toolCall })
          }
        },
        onToolCallsFlushed: (toolCalls: IToolCall[]) => {
          emitter.emit('tool.call.flushed', { toolCalls })
        }
      },
      toolService: {
        execute: async (toolCalls) => {
          const calls = toolCalls.map(tool => ({
            id: tool.id,
            index: tool.index,
            function: tool.name,
            args: tool.args
          }))
          return toolExecutor.execute(calls)
        }
      }
    })

    emitter.emit('request.built', { messageCount: request.messages.length })
    emitter.emit('request.sent', { messageCount: request.messages.length })
    emitter.emit('stream.started', { stream: request.stream !== false })

    let ok = false
    let assistantMessageId: number | undefined
    try {
      await orchestrator.execute()
      ok = true
      if (input.persistMessages) {
        const persisted = this.persistAssistantMessage(messageManager.getLastAssistantMessage(), chat.id, chat.uuid)
        assistantMessageId = persisted
      } else {
        assistantMessageId = this.getLatestAssistantMessageId(chat.uuid)
      }
    } catch (error: any) {
      if (error instanceof AbortError || error?.name === 'AbortError') {
        emitter.emit('submission.aborted', { reason: 'cancelled' })
      } else {
        emitter.emit('submission.failed', { error: this.serializeError(error) })
      }
      throw error
    } finally {
      messageManager.flushPendingAssistantUpdate()
      emitter.emit('stream.completed', {
        ok,
        usage: messageManager.getLastUsage()
      })
      if (ok) {
        emitter.emit('submission.completed', { assistantMessageId: assistantMessageId ?? -1 })
      }
      this.active.delete(input.submissionId)
    }

    return { assistantMessageId }
  }

  cancel(submissionId: string, _reason?: string): void {
    const active = this.active.get(submissionId)
    if (!active) return
    if (!active.controller.signal.aborted) {
      active.controller.abort()
    }
    this.active.delete(submissionId)
  }

  private serializeError(error: any): { name: string; message: string; stack?: string } {
    return {
      name: error?.name || 'Error',
      message: error?.message || 'Unknown error',
      stack: error?.stack
    }
  }

  private ensureAssistantPlaceholder(messageEntities: MessageEntity[], request: IUnifiedRequest): void {
    const lastMessage = messageEntities[messageEntities.length - 1]
    if (lastMessage?.body?.role === 'assistant') {
      return
    }

    messageEntities.push({
      body: {
        role: 'assistant',
        model: request.model,
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    })
  }

  private getLatestAssistantMessageId(chatUuid: string): number | undefined {
    const messages = DatabaseService.getMessagesByChatUuid(chatUuid)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].body.role === 'assistant' && messages[i].id) {
        return messages[i].id
      }
    }
    return undefined
  }

  private persistAssistantMessage(message: MessageEntity, chatId?: number, chatUuid?: string): number | undefined {
    if (!chatId && !chatUuid) return undefined
    const body = {
      ...message.body,
      typewriterCompleted: true,
      source: message.body.source ?? 'schedule'
    }
    const entity: MessageEntity = {
      ...message,
      body,
      chatId,
      chatUuid
    }
    try {
      if (entity.id) {
        DatabaseService.updateMessage(entity)
        return entity.id
      }
      return DatabaseService.saveMessage(entity)
    } catch (error) {
      console.warn('[ChatSubmit] Failed to persist assistant message:', error)
      return undefined
    }
  }

  private async buildRequest(input: MainChatSubmitInput): Promise<IUnifiedRequest> {
    const config = DatabaseService.getConfig()
    if (!config) {
      throw new Error('App config not found')
    }

    const account = config.accounts?.find(item => item.id === input.modelRef.accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const model = account.models.find(item => item.id === input.modelRef.modelId)
    if (!model) {
      throw new Error('Model not found')
    }

    const providerDefinition = config.providerDefinitions?.find(def => def.id === account.providerId)
    if (!providerDefinition) {
      throw new Error('Provider definition not found')
    }

    const chat = this.resolveChatEntity(input.chatId, input.chatUuid)
    const chatId = chat.id ?? input.chatId
    const workspacePath = this.resolveWorkspacePath(chat, input.chatUuid)

    const systemPrompts = await this.buildSystemPrompts(
      workspacePath,
      chatId,
      input.input.prompt
    )

    const compressionSummary = this.resolveCompressionSummary(config, chatId)
    const messageEntities = this.resolveMessageEntities(chat)


    const finalMessages = new RequestMessageBuilder()
      .setSystemPrompts(systemPrompts)
      .setUserInstruction(chat.userInstruction)
      .setMessages(messageEntities)
      .setCompressionSummary(compressionSummary)
      .build()

    const tools = this.buildTools(input.input.tools)

    return {
      providerType: providerDefinition.adapterType,
      apiVersion: providerDefinition.apiVersion,
      baseUrl: account.apiUrl,
      messages: finalMessages,
      apiKey: account.apiKey,
      model: model.id,
      modelType: model.type,
      tools,
      options: input.input.options,
      stream: input.input.stream,
      requestOverrides: providerDefinition.requestOverrides
    }
  }

  private resolveChatEntity(chatId?: number, chatUuid?: string): ChatEntity {
    let chat: ChatEntity | undefined
    if (chatId) {
      chat = DatabaseService.getChatById(chatId)
    }
    if (!chat && chatUuid) {
      chat = DatabaseService.getChatByUuid(chatUuid)
    }
    if (!chat) {
      throw new Error('Chat not found')
    }
    return chat
  }

  private resolveWorkspacePath(chat: ChatEntity, chatUuid?: string): string {
    if (chat.workspacePath) {
      return chat.workspacePath
    }
    const fallbackUuid = chat.uuid || chatUuid
    return `./workspaces/${fallbackUuid || 'tmp'}`
  }

  private resolveCompressionSummary(
    config: IAppConfig,
    chatId?: number
  ): CompressedSummaryEntity | null {
    if (!config.compression?.enabled || !chatId) {
      return null
    }
    const summaries = DatabaseService.getActiveCompressedSummariesByChatId(chatId)
    return summaries.length > 0 ? summaries[0] : null
  }

  private resolveMessageEntities(chat: ChatEntity): MessageEntity[] {
    if (chat.id) {
      return DatabaseService.getMessagesByChatId(chat.id)
    }
    if (chat.uuid) {
      return DatabaseService.getMessagesByChatUuid(chat.uuid)
    }
    return []
  }

  private buildTools(extraTools?: any[]): any[] {
    const toolsByName = new Map<string, any>()

    for (const tool of embeddedToolsRegistry.getAllTools()) {
      const name = tool.function?.name
      if (!name) continue
      toolsByName.set(name, { ...tool.function })
    }

    if (Array.isArray(extraTools)) {
      for (const tool of extraTools) {
        const name = tool?.name
        if (!name) continue
        toolsByName.set(name, tool)
      }
    }

    return Array.from(toolsByName.values())
  }

  private async buildSystemPrompts(
    workspacePath: string,
    chatId?: number,
    prompt?: string
  ): Promise<string[]> {
    const defaultSystemPrompt = systemPromptBuilder(workspacePath)
    const skillsPrompt = await this.buildSkillsPrompt(chatId)

    const skillSlotToken = '$$skill-slot$$'
    const userInstructionSlotToken = '$$user-instruction-slot$$'

    let composedSystemPrompt = defaultSystemPrompt
    composedSystemPrompt = composedSystemPrompt.includes(skillSlotToken)
      ? composedSystemPrompt.replace(skillSlotToken, skillsPrompt)
      : `${composedSystemPrompt}${skillsPrompt}`

    composedSystemPrompt = composedSystemPrompt.includes(userInstructionSlotToken)
      ? composedSystemPrompt.replace(userInstructionSlotToken, '')
      : composedSystemPrompt

    if (prompt) {
      return [prompt, composedSystemPrompt]
    }

    return [composedSystemPrompt]
  }

  private async buildSkillsPrompt(chatId?: number): Promise<string> {
    try {
      const availableSkills = await SkillService.listSkills()
      const chatSkills = chatId ? DatabaseService.getChatSkills(chatId) : []

      if (availableSkills.length === 0 && chatSkills.length === 0) {
        return ''
      }

      const loadedSkills = await Promise.all(
        chatSkills.map(async (name) => {
          try {
            const content = await SkillService.getSkillContent(name)
            return { name, content }
          } catch (error) {
            console.warn(`[Skills] Failed to load skill content: ${name}`, error)
            return null
          }
        })
      )

      return buildSkillsPrompt(
        availableSkills,
        loadedSkills.filter(Boolean) as { name: string; content: string }[]
      )
    } catch (error) {
      console.warn('[Skills] Failed to build skills prompt:', error)
      return ''
    }
  }
}

export type { MainChatSubmitInput }
