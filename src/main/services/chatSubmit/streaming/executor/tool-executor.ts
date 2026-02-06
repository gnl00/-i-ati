/**
 * ToolExecutor - 并发工具执行引擎
 *
 * 功能：
 * - 并发执行，支持并发控制（默认最多 3 个并发）
 * - 进度报告（实时 UI 更新）
 * - 优雅的错误处理（单个工具失败不影响其他工具）
 * - AbortSignal 支持（可随时中止执行）
 * - 支持 embedded 和 MCP 两种工具类型
 */

import { toolCall as mcpToolCall } from '@main/mcp/client'
import { v4 as uuidv4 } from 'uuid'
import { normalizeToolArgs } from '../../utils'
import type { ToolCallProps } from '../../types'
import { assessCommandRisk } from '@main/tools/command/CommandProcessor'
import type {
  IToolExecutor,
  ToolExecutorConfig,
  ToolExecutionResult,
  ToolExecutionProgress
} from './types'
import { embeddedToolsRegistry } from '@tools/registry'
import { AbortError, ToolExecutionError } from '../../errors'

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  maxConcurrency: 3
}

/**
 * ToolExecutor - 并发工具执行引擎
 */
export class ToolExecutor implements IToolExecutor {
  private readonly config: {
    maxConcurrency: number
  }
  private readonly onProgress?: (progress: ToolExecutionProgress) => void
  private readonly signal?: AbortSignal
  private readonly chatUuid?: string
  private readonly requestConfirmation?: ToolExecutorConfig['requestConfirmation']

  constructor(config: ToolExecutorConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency
    }
    this.onProgress = config.onProgress
    this.signal = config.signal
    this.chatUuid = config.chatUuid
    this.requestConfirmation = config.requestConfirmation
  }

  /**
   * 并发执行多个工具调用
   */
  async execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]> {
    if (calls.length === 0) {
      return []
    }

    // 检查中止信号
    if (this.signal?.aborted) {
      return calls.map(call => this.createAbortedResult(call))
    }

    // 根据最大并发数分块
    const chunks = this.chunkArray(calls, this.config.maxConcurrency)
    const allResults: ToolExecutionResult[] = []

    // 顺序执行每个块，块内并发执行
    for (const chunk of chunks) {
      if (this.signal?.aborted) {
        // 为剩余工具添加中止结果
        allResults.push(...chunk.map(call => this.createAbortedResult(call)))
        continue
      }

      const chunkResults = await Promise.allSettled(
        chunk.map(call => this.executeOne(call))
      )

      // 转换 PromiseSettledResult 为 ToolExecutionResult
      const results = chunkResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          // Promise 拒绝（不应该发生，因为 executeOne 捕获所有错误）
          return this.createErrorResult(chunk[index], result.reason)
        }
      })

      allResults.push(...results)
    }

    return allResults
  }

  /**
   * 执行单个工具调用
   */
  private async executeOne(call: ToolCallProps): Promise<ToolExecutionResult> {
    const toolId = call.id || `call_${uuidv4()}`
    const toolName = call.function
    const toolIndex = call.index ?? 0
    const startTime = Date.now()

    const requiresPlanReview = toolName === 'plan_create' && Boolean(this.requestConfirmation)
    const requiresCommandReview = toolName === 'execute_command' && Boolean(this.requestConfirmation)

    if (!requiresPlanReview && !requiresCommandReview) {
      // 报告开始
      this.reportProgress({
        id: toolId,
        name: toolName,
        phase: 'started'
      })
    }

    try {
      // 执行前检查中止
      if (this.signal?.aborted) {
        return this.createAbortedResult(call)
      }

      let runtimeArgs = this.normalizeArgs(call)
      if (requiresPlanReview && this.requestConfirmation) {
        const decision = await this.requestConfirmation({
          toolCallId: toolId,
          name: toolName,
          args: runtimeArgs
        })
        if (!decision.approved) {
          const result = this.createAbortedResultWithReason(call, decision.reason)
          this.reportProgress({
            id: toolId,
            name: toolName,
            phase: 'completed',
            result
          })
          return result
        }
        if (decision.args) {
          runtimeArgs = this.applyRuntimeContext(normalizeToolArgs(decision.args), toolName)
        }
      }

      if (requiresCommandReview && this.requestConfirmation) {
        const command = typeof runtimeArgs?.command === 'string' ? runtimeArgs.command : ''
        const risk = assessCommandRisk(command)
        if (risk.level === 'dangerous' || risk.level === 'warning') {
          const decision = await this.requestConfirmation({
            toolCallId: toolId,
            name: toolName,
            args: runtimeArgs,
            ui: {
              command,
              riskLevel: risk.level === 'warning' ? 'risky' : 'dangerous',
              reason: risk.reason
            }
          })
          if (!decision.approved) {
            const result = this.createAbortedResultWithReason(call, decision.reason)
            this.reportProgress({
              id: toolId,
              name: toolName,
              phase: 'completed',
              result
            })
            return result
          }
          runtimeArgs = {
            ...runtimeArgs,
            confirmed: true
          }
        } else {
          runtimeArgs = {
            ...runtimeArgs,
            confirmed: true
          }
        }
      }

      if (requiresPlanReview || requiresCommandReview) {
        this.reportProgress({
          id: toolId,
          name: toolName,
          phase: 'started'
        })
      }

      // 直接执行工具
      const content = await this.executeTool(call, runtimeArgs)

      const result: ToolExecutionResult = {
        id: toolId,
        index: toolIndex,
        name: toolName,
        content,
        cost: Date.now() - startTime,
        status: 'success'
      }

      // 报告完成
      this.reportProgress({
        id: toolId,
        name: toolName,
        phase: 'completed',
        result
      })

      return result

    } catch (error: any) {
      const result = this.createErrorResult(call, error, Date.now() - startTime)

      // 报告失败
      this.reportProgress({
        id: toolId,
        name: toolName,
        phase: 'failed',
        result
      })

      return result
    }
  }

  /**
   * 执行实际的工具（embedded 或 MCP）
   */
  private async executeTool(call: ToolCallProps, runtimeArgs?: any): Promise<any> {
    const toolName = call.function

    // 检查是否是 embedded 工具
    if (embeddedToolsRegistry.isRegistered(toolName)) {
      const safeArgs = runtimeArgs ?? this.normalizeArgs(call)
      const handler = embeddedToolsRegistry.getHandler(toolName)
      if (!handler) {
        throw new Error(`Tool "${toolName}" is not registered`)
      }
      return await handler(safeArgs)
    }

    // 否则是 MCP 工具
    const callId = call.id || `call_${uuidv4()}`
    const safeArgs = runtimeArgs ?? this.normalizeArgs(call)
    return await mcpToolCall(callId, toolName, safeArgs as { [x: string]: unknown })
  }

  private normalizeArgs(call: ToolCallProps): any {
    const args = typeof call.args === 'string'
      ? JSON.parse(call.args)
      : call.args
    const normalizedArgs = normalizeToolArgs(args)
    return this.applyRuntimeContext(normalizedArgs, call.function)
  }

  /**
   * 将运行时上下文注入工具参数
   */
  private applyRuntimeContext(args: any, toolName?: string): any {
    if (!args || typeof args !== 'object') {
      return args
    }

    if (this.chatUuid && (toolName?.startsWith('schedule_') || toolName?.startsWith('plan_'))) {
      // chat_uuid is system context; always override for schedule/plan tools.
      return { ...args, chat_uuid: this.chatUuid }
    }

    if (this.chatUuid && !args.chat_uuid) {
      return { ...args, chat_uuid: this.chatUuid }
    }

    return args
  }

  /**
   * 从异常创建错误结果
   */
  private createErrorResult(
    call: ToolCallProps,
    error: any,
    cost: number = 0
  ): ToolExecutionResult {
    const toolId = call.id || `call_${uuidv4()}`
    const toolName = call.function
    const toolIndex = call.index ?? 0

    let status: ToolExecutionResult['status'] = 'error'
    let wrappedError: Error

    if (error instanceof AbortError || error.name === 'AbortError') {
      status = 'aborted'
      wrappedError = error
    } else if (error instanceof ToolExecutionError) {
      wrappedError = error
    } else {
      wrappedError = new ToolExecutionError(toolName, error)
    }

    return {
      id: toolId,
      index: toolIndex,
      name: toolName,
      content: null,
      cost,
      error: wrappedError,
      status
    }
  }

  /**
   * 创建中止结果
   */
  private createAbortedResult(call: ToolCallProps): ToolExecutionResult {
    const error = new AbortError('Execution aborted')

    return {
      id: call.id || `call_${uuidv4()}`,
      index: call.index ?? 0,
      name: call.function,
      content: null,
      cost: 0,
      status: 'aborted',
      error
    }
  }

  private createAbortedResultWithReason(call: ToolCallProps, reason?: string): ToolExecutionResult {
    return {
      id: call.id || `call_${uuidv4()}`,
      index: call.index ?? 0,
      name: call.function,
      content: {
        success: false,
        reason: reason || 'user abort'
      },
      cost: 0,
      status: 'aborted'
    }
  }

  /**
   * 报告进度（如果提供了回调）
   */
  private reportProgress(progress: ToolExecutionProgress): void {
    if (this.onProgress) {
      try {
        this.onProgress(progress)
      } catch (error) {
        console.error('[ToolExecutor] Progress callback error:', error)
      }
    }
  }

  /**
   * 将数组分块
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
