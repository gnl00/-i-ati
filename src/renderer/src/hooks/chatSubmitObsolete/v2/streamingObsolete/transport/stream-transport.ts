/**
 * 统一流式传输实现
 * 封装 unifiedChatRequest，提供统一的 AsyncIterable 接口
 */

import { unifiedChatRequest } from '@request/index'
import type { StreamTransport } from '..'

/**
 * 统一聊天流式传输
 * 实现统一的流式请求接口
 */
export class UnifiedChatTransport implements StreamTransport {
  constructor(
    private readonly beforeFetch: () => void,
    private readonly afterFetch: () => void
  ) { }

  /**
   * 发起流式请求
   * @param req 统一请求对象
   * @param signal 中断信号
   * @returns 异步迭代器，产生响应 chunk
   */
  async *request(
    req: IUnifiedRequest,
    signal: AbortSignal
  ): AsyncIterable<IUnifiedResponse> {
    this.beforeFetch()

    try {
      const response = await unifiedChatRequest(
        req,
        signal,
        this.beforeFetch,
        this.afterFetch
      )

      // 检查是否为流式响应
      if (req.stream === false) {
        // 非流式：直接返回完整响应
        yield response as IUnifiedResponse
      } else {
        // 流式：迭代每个 chunk
        for await (const chunk of response as AsyncIterable<IUnifiedResponse>) {
          // 检查是否被中断
          if (signal.aborted) {
            throw new Error('Request aborted')
          }
          yield chunk
        }
      }
    } finally {
      this.afterFetch()
    }
  }
}

/**
 * 导出 StreamTransport 接口（从 types 中重新导出）
 */
export type { StreamTransport } from '..'
