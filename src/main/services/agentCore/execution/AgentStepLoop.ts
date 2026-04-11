import { unifiedChatRequest } from '@main/request/index'
import { createLogger } from '@main/services/logging/LogService'
import { buildMessageSegmentId } from '@shared/chatRun/segmentId'
import { AbortError } from '../errors'
import { formatWebSearchForLLM, normalizeToolArgs } from '../utils'
import type { ChunkParser, ParseResult } from './parser'
import { ToolExecutor } from '../tools'
import type {
  ToolExecutionProgress,
  ToolExecutionResult,
  ToolExecutorConfig
} from '../tools'
import type { StepResult, ToolCall } from '../types'
import type { RequestHistory } from './RequestHistory'
import type { AgentStepCommitter } from './AgentStepCommitter'
import { AssistantCycleBuffer } from './AssistantCycleBuffer'

export interface AgentStepToolService {
  execute(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]>
}

export interface AgentStepInput {
  request: IUnifiedRequest
  modelName: string
  chatUuid?: string
  signal: AbortSignal
}

export interface AgentStepRuntime {
  parser: ChunkParser
  requestHistory: RequestHistory
  stepCommitter: AgentStepCommitter
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
  private readonly chatUuid?: string
  private readonly signal: AbortSignal
  private readonly parser: ChunkParser
  private readonly requestHistory: RequestHistory
  private readonly stepCommitter: AgentStepCommitter
  private readonly beforeFetch: () => void
  private readonly afterFetch: () => void
  private readonly toolService?: AgentStepToolService
  private readonly toolConfirmationHandler?: ToolExecutorConfig['requestConfirmation']
  private readonly onPhaseChange?: (phase: 'receiving' | 'toolCall') => void
  private readonly onChunk?: (result: ParseResult) => void
  private readonly onToolCallsDetected?: (toolCalls: ToolCall[]) => void
  private readonly onToolCallsFlushed?: (toolCalls: IToolCall[]) => void
  private readonly logger = createLogger('AgentStepLoop')
  private readonly cycleBuffer = new AssistantCycleBuffer()
  private toolCallIds = new Set<string>()
  private tools: ToolCall[] = []

  constructor(input: AgentStepInput, runtime: AgentStepRuntime) {
    this.request = input.request as IUnifiedRequest
    this.chatUuid = input.chatUuid
    this.signal = input.signal
    this.parser = runtime.parser
    this.requestHistory = runtime.requestHistory
    this.stepCommitter = runtime.stepCommitter
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
      cycleCount += 1
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
      this.logger.warn('max_cycles_reached', { maxCycles: MAX_CYCLES })
    }

    return {
      usage: this.stepCommitter.getLastUsage(),
      completed,
      finishReason: completed ? 'completed' : 'max_cycles',
      requestHistoryMessages: this.requestHistory.getMessages(),
      artifacts: this.stepCommitter.getArtifacts()
    }
  }

  private async executeSingleCycle(): Promise<boolean> {
    this.stepCommitter.beginCycle()
    this.stepCommitter.clearStreamPreview()
    this.cycleBuffer.reset()
    this.onPhaseChange?.('receiving')
    await this.sendRequest()

    if (this.hasToolCalls()) {
      this.onPhaseChange?.('toolCall')
      await this.executeToolCalls()
      this.tools = []
      this.toolCallIds.clear()
      return true
    }

    const snapshot = this.cycleBuffer.snapshot()
    if (snapshot.segments.length > 0 || (snapshot.toolCalls?.length ?? 0) > 0) {
      this.stepCommitter.commitFinalCycle(snapshot)
      this.stepCommitter.clearStreamPreview()
      this.requestHistory.appendAssistantCycle({
        role: 'assistant',
        content: snapshot.content,
        segments: snapshot.segments,
        toolCalls: snapshot.toolCalls
      })
    }

    return false
  }

  private hasToolCalls(): boolean {
    return this.getPendingTools().length > 0
  }

  private async sendRequest(): Promise<void> {
    try {
      this.requestHistory.syncRequest(this.request)

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
    this.cycleBuffer.setContent(resp.content)
    this.stepCommitter.updateStreamPreview(this.cycleBuffer.snapshot())

    if (resp.usage) {
      this.stepCommitter.setLastUsage(resp.usage)
    }
  }

  private handleChunk(chunk: IUnifiedResponse): void {
    const result = this.parser.parse(chunk, this.tools)

    if (chunk.usage) {
      this.stepCommitter.setLastUsage(chunk.usage)
    }

    this.tools = result.toolCalls
    this.emitDetectedToolCalls(result.toolCalls)
    this.cycleBuffer.applyParseResult(result)
    this.stepCommitter.updateStreamPreview(this.cycleBuffer.snapshot())
    this.onChunk?.(result)
  }

  private async flushToolCallPlaceholder(): Promise<void> {
    const pendingTools = this.getPendingTools()
    if (pendingTools.length === 0) {
      return
    }

    const toolCalls = pendingTools.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.args
      }
    }))

    this.cycleBuffer.setToolCalls(toolCalls)
    const snapshot = this.cycleBuffer.snapshot()

    this.onToolCallsFlushed?.(toolCalls)
    this.stepCommitter.commitToolOnlyCycle(snapshot)
    this.stepCommitter.clearStreamPreview()
    this.requestHistory.appendAssistantCycle({
      role: 'assistant',
      content: snapshot.content,
      segments: snapshot.segments,
      toolCalls: snapshot.toolCalls
    })
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

    this.cycleBuffer.appendToolResultSegment({
      type: 'toolCall',
      segmentId: buildMessageSegmentId('toolCall', 'legacy-tool-result', result.id),
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

    this.syncCurrentCycleSnapshot()
    await this.stepCommitter.commitToolResult(toolFunctionMessage)
    this.requestHistory.appendToolResult(toolFunctionMessage)
  }

  private async handleToolFailure(result: ToolExecutionResult): Promise<void> {
    const tool = this.tools.find(t => t.id === result.id)
    const toolArgs = tool ? parseToolArgsForSegment(tool.args) : undefined
    this.logger.error('tool_execution_failed', {
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

    this.cycleBuffer.appendToolResultSegment({
      type: 'toolCall',
      segmentId: buildMessageSegmentId('toolCall', 'legacy-tool-result', result.id),
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

    this.syncCurrentCycleSnapshot()
    await this.stepCommitter.commitToolResult(toolFunctionMessage)
    this.requestHistory.appendToolResult(toolFunctionMessage)
  }

  private syncCurrentCycleSnapshot(): void {
    const snapshot = this.cycleBuffer.snapshot()
    this.stepCommitter.commitToolOnlyCycle(snapshot)
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
          this.logger.info('tool_progress.started', { name: progress.name })
        } else if (progress.phase === 'completed') {
          this.logger.info('tool_progress.completed', {
            name: progress.name,
            cost: progress.result?.cost
          })
        } else if (progress.phase === 'failed') {
          this.logger.error('tool_progress.failed', {
            name: progress.name,
            error: progress.result?.error
          })
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
