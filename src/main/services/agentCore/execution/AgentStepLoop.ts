import { unifiedChatRequest } from '@main/request/index'
import { AbortError } from '@main/services/chatRun/errors'
import { formatWebSearchForLLM, normalizeToolArgs } from '@main/services/chatRun/utils'
import type { ChunkParser, ParseResult } from './parser'
import { SegmentBuilder } from './parser'
import { extractContentFromSegments } from './parser/segment-content'
import { ToolExecutor } from '../tools'
import type {
  ToolExecutionProgress,
  ToolExecutionResult,
  ToolExecutorConfig
} from '../tools'
import type { StepArtifact, StepResult, ToolCall } from '../types'

export interface AgentStepToolService {
  execute(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]>
}

export interface AgentStepMessageManager {
  rebuildRequestMessages(): void
  updateLastAssistantMessage(updater: (message: MessageEntity) => MessageEntity): void
  getLastAssistantMessage(): MessageEntity
  appendSegmentToLastMessage(segment: MessageSegment): void
  setLastUsage(usage: ITokenUsage): void
  getLastUsage(): ITokenUsage | undefined
  addToolCallMessage(toolCalls: IToolCall[], content: string): Promise<void>
  addToolResultMessage(toolMsg: ChatMessage): Promise<void>
  flushPendingAssistantUpdate(): void
  getRequestMessages(): ChatMessage[]
  getArtifacts(): StepArtifact[]
}

export interface AgentStepInput {
  request: IUnifiedRequest
  modelName: string
  chatUuid?: string
  signal: AbortSignal
}

export interface AgentStepRuntime {
  parser: ChunkParser
  messageManager: AgentStepMessageManager
  beforeFetch: () => void
  afterFetch: () => void
  toolService?: AgentStepToolService
  toolConfirmationHandler?: ToolExecutorConfig['requestConfirmation']
  onPhaseChange?: (phase: 'receiving' | 'toolCall') => void
  onChunk?: (result: ParseResult) => void
  onToolCallsDetected?: (toolCalls: ToolCall[]) => void
  onToolCallsFlushed?: (toolCalls: IToolCall[]) => void
}

const handleToolCallResult = (functionName: string, results: any) => {
  return functionName === 'web_search'
    ? formatWebSearchForLLM(results)
    : JSON.stringify({ ...results, functionCallCompleted: true })
}

const handleToolCallError = (_functionName: string, result: ToolExecutionResult) => {
  const errorPayload = {
    success: false,
    error: result.error?.message || 'Unknown error',
    status: result.status,
    functionCallCompleted: true
  }
  return JSON.stringify(errorPayload)
}

const parseToolArgsForSegment = (args: string): unknown => {
  if (!args.trim()) {
    return {}
  }

  try {
    return normalizeToolArgs(JSON.parse(args))
  } catch {
    return args
  }
}

export class AgentStepLoop {
  private readonly request: IUnifiedRequest
  private readonly modelName: string
  private readonly chatUuid?: string
  private readonly signal: AbortSignal
  private readonly parser: ChunkParser
  private readonly messageManager: AgentStepMessageManager
  private readonly beforeFetch: () => void
  private readonly afterFetch: () => void
  private readonly toolService?: AgentStepToolService
  private readonly toolConfirmationHandler?: ToolExecutorConfig['requestConfirmation']
  private readonly onPhaseChange?: (phase: 'receiving' | 'toolCall') => void
  private readonly onChunk?: (result: ParseResult) => void
  private readonly onToolCallsDetected?: (toolCalls: ToolCall[]) => void
  private readonly onToolCallsFlushed?: (toolCalls: IToolCall[]) => void
  private toolCallIds = new Set<string>()
  private tools: ToolCall[] = []

  constructor(input: AgentStepInput, runtime: AgentStepRuntime) {
    this.request = input.request as IUnifiedRequest
    this.modelName = input.modelName
    this.chatUuid = input.chatUuid
    this.signal = input.signal
    this.parser = runtime.parser
    this.messageManager = runtime.messageManager
    this.beforeFetch = runtime.beforeFetch
    this.afterFetch = runtime.afterFetch
    this.toolService = runtime.toolService
    this.toolConfirmationHandler = runtime.toolConfirmationHandler
    this.onPhaseChange = runtime.onPhaseChange
    this.onChunk = runtime.onChunk
    this.onToolCallsDetected = runtime.onToolCallsDetected
    this.onToolCallsFlushed = runtime.onToolCallsFlushed
  }

  private getPendingTools() {
    return this.tools.filter(t => t.status === 'pending')
  }

  async execute(): Promise<StepResult> {
    let cycleCount = 0
    const MAX_CYCLES = 20
    let hasExecutedTools = false

    while (cycleCount < MAX_CYCLES) {
      cycleCount++
      hasExecutedTools = await this.executeSingleCycle()

      if (hasExecutedTools) {
        continue
      }

      if (!this.hasToolCalls()) {
        break
      }
    }

    const completed = !(cycleCount >= MAX_CYCLES && this.hasToolCalls())
    if (!completed) {
      console.warn(`[AgentStepLoop] Max cycles (${MAX_CYCLES}) reached, stopping`)
    }

    return {
      usage: this.messageManager.getLastUsage(),
      completed,
      finishReason: completed ? 'completed' : 'max_cycles',
      messages: this.messageManager.getRequestMessages(),
      artifacts: this.messageManager.getArtifacts()
    }
  }

  private async executeSingleCycle(): Promise<boolean> {
    this.onPhaseChange?.('receiving')
    await this.sendRequest()

    if (this.hasToolCalls()) {
      this.onPhaseChange?.('toolCall')
      await this.executeToolCalls()
      this.tools = []
      this.toolCallIds.clear()
      return true
    }

    return false
  }

  private hasToolCalls(): boolean {
    return this.getPendingTools().length > 0
  }

  private async sendRequest(): Promise<void> {
    try {
      this.messageManager.rebuildRequestMessages()

      const response = await unifiedChatRequest(
        this.request,
        this.signal,
        this.beforeFetch,
        this.afterFetch
      )

      if (this.request.stream === false) {
        this.processNonStreamingResponse(response as IUnifiedResponse)
      } else {
        await this.processStreamingResponse(response as AsyncIterable<IUnifiedResponse>)
      }
    } catch (error) {
      if (error instanceof AbortError || (error as Error).name === 'AbortError') {
        throw error
      }
      throw error
    }
  }

  private async processStreamingResponse(
    response: AsyncIterable<IUnifiedResponse>
  ): Promise<void> {
    for await (const chunk of response) {
      if (this.signal.aborted) {
        throw new AbortError()
      }
      this.handleChunk(chunk)
    }

    await this.flushToolCallPlaceholder()
  }

  private processNonStreamingResponse(resp: IUnifiedResponse): void {
    this.messageManager.updateLastAssistantMessage((last) => ({
      ...last,
      body: {
        ...last.body,
        role: 'assistant',
        model: this.modelName,
        content: resp.content,
        segments: [{
          type: 'text',
          content: resp.content,
          timestamp: Date.now()
        }],
        typewriterCompleted: false
      }
    }))

    if (resp.usage) {
      this.messageManager.setLastUsage(resp.usage)
    }
  }

  private handleChunk(chunk: IUnifiedResponse): void {
    const result = this.parser.parse(chunk, this.tools)

    if (chunk.usage) {
      this.messageManager.setLastUsage(chunk.usage)
    }

    this.tools = result.toolCalls
    this.emitDetectedToolCalls(result.toolCalls)
    this.applyParseResult(result)
    this.onChunk?.(result)
  }

  private applyParseResult(result: ParseResult): void {
    const segmentBuilder = new SegmentBuilder()
    const lastMessage = this.messageManager.getLastAssistantMessage()

    if (!lastMessage.body.segments) {
      lastMessage.body.segments = []
    }

    let segments = [...(lastMessage.body.segments || [])]

    if (result.reasoningDelta.trim()) {
      segments = segmentBuilder.appendSegment(segments, result.reasoningDelta, 'reasoning')
    }

    if (result.contentDelta.trim()) {
      segments = segmentBuilder.appendSegment(segments, result.contentDelta, 'text')
    }

    this.messageManager.updateLastAssistantMessage(msg => ({
      ...msg,
      body: {
        ...msg.body,
        segments
      }
    }))
  }

  private async flushToolCallPlaceholder(): Promise<void> {
    const pendingTools = this.getPendingTools()
    if (pendingTools.length === 0) {
      return
    }

    const lastAssistantMessage = this.messageManager.getLastAssistantMessage()
    const content = extractContentFromSegments(lastAssistantMessage.body.segments)

    const toolCalls = pendingTools.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.args
      }
    }))

    this.onToolCallsFlushed?.(toolCalls)
    await this.messageManager.addToolCallMessage(toolCalls, content)
  }

  private async executeToolCalls(): Promise<void> {
    const pendingTools = this.getPendingTools()
    if (pendingTools.length === 0) {
      return
    }

    pendingTools.forEach(tool => {
      tool.status = 'executing'
    })

    const results = this.toolService
      ? await this.toolService.execute(pendingTools)
      : await this.executeWithDefaultToolExecutor(pendingTools)

    for (const result of results) {
      const tool = this.tools.find(t => t.id === result.id)
      if (!tool) continue

      if (result.status === 'success') {
        tool.status = 'success'
        tool.result = result.content
        tool.cost = result.cost
        await this.handleToolSuccess(result)
      } else {
        tool.status = result.status === 'aborted' ? 'aborted' : 'failed'
        tool.error = result.error?.message
        tool.cost = result.cost
        await this.handleToolFailure(result)
      }
    }
  }

  private async handleToolSuccess(result: ToolExecutionResult): Promise<void> {
    const tool = this.tools.find(t => t.id === result.id)
    const toolArgs = tool ? parseToolArgsForSegment(tool.args) : undefined
    const toolFunctionMessage: ChatMessage = {
      role: 'tool',
      name: result.name,
      toolCallId: result.id,
      content: handleToolCallResult(result.name, result.content),
      segments: []
    }

    this.messageManager.appendSegmentToLastMessage({
      type: 'toolCall',
      name: result.name,
      content: {
        toolName: result.name,
        args: toolArgs,
        result: result.content,
        status: 'success'
      },
      cost: result.cost,
      timestamp: Date.now(),
      toolCallId: result.id,
      toolCallIndex: result.index
    })

    await this.messageManager.addToolResultMessage(toolFunctionMessage)
  }

  private async handleToolFailure(result: ToolExecutionResult): Promise<void> {
    const tool = this.tools.find(t => t.id === result.id)
    const toolArgs = tool ? parseToolArgsForSegment(tool.args) : undefined
    console.error(`[Tool] Execution failed:`, {
      name: result.name,
      status: result.status,
      error: result.error,
      cost: result.cost
    })

    const toolFunctionMessage: ChatMessage = {
      role: 'tool',
      name: result.name,
      toolCallId: result.id,
      content: handleToolCallError(result.name, result),
      segments: []
    }

    this.messageManager.appendSegmentToLastMessage({
      type: 'toolCall',
      name: result.name,
      content: {
        toolName: result.name,
        args: toolArgs,
        error: result.error?.message || 'Unknown error',
        status: result.status
      },
      cost: result.cost,
      timestamp: Date.now(),
      toolCallId: result.id,
      toolCallIndex: result.index
    })

    await this.messageManager.addToolResultMessage(toolFunctionMessage)
  }

  private emitDetectedToolCalls(toolCalls: ToolCall[]): void {
    if (!this.onToolCallsDetected) {
      return
    }
    const newlyDetected: ToolCall[] = []
    for (const call of toolCalls) {
      if (!call.id) continue
      if (this.toolCallIds.has(call.id)) continue
      this.toolCallIds.add(call.id)
      newlyDetected.push(call)
    }
    if (newlyDetected.length > 0) {
      this.onToolCallsDetected(newlyDetected)
    }
  }

  private async executeWithDefaultToolExecutor(
    toolCalls: ToolCall[]
  ): Promise<ToolExecutionResult[]> {
    const executor = new ToolExecutor({
      maxConcurrency: 3,
      signal: this.signal,
      chatUuid: this.chatUuid,
      requestConfirmation: this.toolConfirmationHandler,
      onProgress: (progress: ToolExecutionProgress) => {
        if (progress.phase === 'started') {
          console.log(`[Tool] Starting: ${progress.name}`)
        } else if (progress.phase === 'completed') {
          console.log(`[Tool] Completed: ${progress.name} (${progress.result?.cost}ms)`)
        } else if (progress.phase === 'failed') {
          console.error(`[Tool] Failed: ${progress.name}`, progress.result?.error)
        }
      }
    })

    const toolCallProps = toolCalls.map(t => ({
      id: t.id,
      index: t.index,
      function: t.name,
      args: t.args
    }))

    return executor.execute(toolCallProps)
  }
}
