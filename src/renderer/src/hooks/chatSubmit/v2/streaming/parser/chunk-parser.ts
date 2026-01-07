/**
 * Chunk 解析器
 * 协调所有子解析器，提供统一的解析接口
 */

import type { StreamingState } from '../../types'
import { ThinkTagParser } from './think-tag-parser'
import { ToolCallParser } from './tool-call-parser'
import type { ChunkParser as IChunkParser, ParseResult } from './types'

/**
 * Chunk 解析器实现
 * 整合 think tag、tool call、content 解析
 */
export class ChunkParser implements IChunkParser {
  private thinkTagParser = new ThinkTagParser()
  private toolCallParser = new ToolCallParser()

  /**
   * 解析单个响应 chunk
   */
  parse(chunk: IUnifiedResponse, currentState: StreamingState): ParseResult {
    let contentDelta = ''
    let reasoningDelta = ''
    let hasThinkTag = currentState.isContentHasThinkTag
    let isInThinkTag = currentState.isContentHasThinkTag

    // 1. 优先处理 reasoning 字段（如果有）
    if (chunk.reasoning) {
      reasoningDelta = chunk.reasoning
      // reasoning 字段存在时，不处理 content
    } else if (chunk.content) {
      // 2. 如果没有 reasoning 字段，使用 Think Tag Parser 处理 content
      const thinkResult = this.thinkTagParser.parse(
        chunk.content,
        hasThinkTag
      )
      contentDelta = thinkResult.textDelta
      reasoningDelta = thinkResult.reasoningDelta
      hasThinkTag = thinkResult.hasThinkTag
      isInThinkTag = thinkResult.hasThinkTag
    }

    // 3. 使用 Tool Call Parser 处理 tool calls
    const toolCalls = this.toolCallParser.parse(
      chunk.toolCalls,
      currentState.tools.toolCalls
    )

    return {
      contentDelta,
      reasoningDelta,
      toolCalls,
      hasThinkTag,
      isInThinkTag
    }
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.thinkTagParser.reset()
  }
}
