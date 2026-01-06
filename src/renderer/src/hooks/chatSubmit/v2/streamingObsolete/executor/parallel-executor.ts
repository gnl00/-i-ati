/**
 * 并行工具执行器
 * 支持并行执行、重试、超时控制
 */

import { invokeMcpToolCall } from '@renderer/invoker/ipcInvoker'
import { embeddedToolsRegistry } from '@tools/index'
import type { ToolCallProps } from '../../types'
import { normalizeToolArgs } from '../../utils'
import type {
  ToolExecutor as IToolExecutor,
  RetryConfig,
  TimeoutConfig,
  ToolExecutionResult
} from '../types'
import { withRetry } from './retry-decorator'
import { withTimeout } from './timeout-decorator'

/**
 * 并行工具执行器配置
 */
export interface ParallelToolExecutorConfig {
  /** 最大并发数 */
  maxConcurrency?: number
  /** 超时配置 */
  timeoutConfig?: TimeoutConfig
  /** 重试配置 */
  retryConfig?: Partial<RetryConfig>
}

/**
 * 并行工具执行器
 * 支持并行执行多个工具调用
 */
export class ParallelToolExecutor implements IToolExecutor {
  private readonly maxConcurrency: number
  private readonly timeoutMs: number
  private readonly retryConfig: Partial<RetryConfig>

  constructor(config: ParallelToolExecutorConfig = {}) {
    this.maxConcurrency = config.maxConcurrency ?? 3
    this.timeoutMs = config.timeoutConfig?.timeout ?? 30000
    this.retryConfig = config.retryConfig ?? {}
  }

  /**
   * 执行多个工具调用（并行，但限制并发数）
   */
  async execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]> {
    if (calls.length === 0) {
      return []
    }

    // 将工具调用分块，每块最多 maxConcurrency 个
    const chunks = this.chunk(calls, this.maxConcurrency)
    const allResults: ToolExecutionResult[] = []

    // 逐块执行
    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(call => this.executeOne(call))
      )

      // 处理结果
      const results = chunkResults.map(result =>
        this.handleSettledResult(result, chunk[chunkResults.indexOf(result)])
      )
      allResults.push(...results)
    }

    return allResults
  }

  /**
   * 执行单个工具调用
   */
  private async executeOne(call: ToolCallProps): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    const name = call.function

    try {
      // 带超时和重试的执行
      const content = await withTimeout(
        () =>
          withRetry(async () => {
            let result: any

            if (embeddedToolsRegistry.isRegistered(call.function)) {
              // 内置工具
              const args =
                typeof call.args === 'string'
                  ? JSON.parse(call.args)
                  : call.args
              const normalizedArgs = normalizeToolArgs(args)
              result = await embeddedToolsRegistry.execute(
                call.function,
                normalizedArgs
              )
            } else {
              // MCP 工具
              result = await invokeMcpToolCall({
                callId: call.id || `call_${Date.now()}`,
                tool: call.function,
                args: call.args
              })
            }

            return result
          }, this.retryConfig),
        this.timeoutMs
      )

      return {
        name,
        content,
        cost: Date.now() - startTime
      }
    } catch (error) {
      return {
        name,
        content: null,
        cost: Date.now() - startTime,
        error: error as Error
      }
    }
  }

  /**
   * 处理 Promise.allSettled 的结果
   */
  private handleSettledResult(
    result: PromiseSettledResult<ToolExecutionResult>,
    call: ToolCallProps
  ): ToolExecutionResult {
    if (result.status === 'fulfilled') {
      return result.value
    } else {
      return {
        name: call.function,
        content: null,
        cost: 0,
        error: result.reason
      }
    }
  }

  /**
   * 将数组分块
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
