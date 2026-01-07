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

import { invokeMcpToolCall } from '@renderer/invoker/ipcInvoker'
import { embeddedToolsRegistry } from '@tools/index'
import { v4 as uuidv4 } from 'uuid'
import { normalizeToolArgs } from '../../utils'
import type { ToolCallProps } from '../../types'
import type {
  IToolExecutor,
  ToolExecutorConfig,
  ToolExecutionResult,
  ToolExecutionProgress
} from './types'
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

  constructor(config: ToolExecutorConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency
    }
    this.onProgress = config.onProgress
    this.signal = config.signal
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
    const startTime = Date.now()

    // 报告开始
    this.reportProgress({
      id: toolId,
      name: toolName,
      phase: 'started'
    })

    try {
      // 执行前检查中止
      if (this.signal?.aborted) {
        return this.createAbortedResult(call)
      }

      // 直接执行工具
      const content = await this.executeTool(call)

      const result: ToolExecutionResult = {
        id: toolId,
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
  private async executeTool(call: ToolCallProps): Promise<any> {
    const toolName = call.function

    // 检查是否是 embedded 工具
    if (embeddedToolsRegistry.isRegistered(toolName)) {
      const args = typeof call.args === 'string'
        ? JSON.parse(call.args)
        : call.args
      const normalizedArgs = normalizeToolArgs(args)
      return await embeddedToolsRegistry.execute(toolName, normalizedArgs)
    }

    // 否则是 MCP 工具
    return await invokeMcpToolCall({
      callId: call.id || `call_${uuidv4()}`,
      tool: toolName,
      args: call.args
    })
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
      name: call.function,
      content: null,
      cost: 0,
      status: 'aborted',
      error
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
