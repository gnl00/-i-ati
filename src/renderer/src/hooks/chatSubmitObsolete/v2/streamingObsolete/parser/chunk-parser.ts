/**
 * Chunk 解析器
 * 协调所有子解析器，提供统一的解析接口
 */

import type { ChunkParser as IChunkParser, ParseResult } from '..'
import type { StreamingState } from '../../../../chatSubmit/v2/types'
import { ContentParser } from './content-parser'
import { ThinkTagParser } from './think-tag-parser'
import { ToolCallParser } from './tool-call-parser'

/**
 * Chunk 解析器实现
 * 整合 think tag、tool call、content 解析
 */
export class ChunkParser implements IChunkParser {
  private thinkTagParser = new ThinkTagParser()
  private toolCallParser = new ToolCallParser()
  private contentParser = new ContentParser()

  /**
   * 解析单个响应 chunk
   */
  parse(chunk: IUnifiedResponse, currentState: StreamingState): ParseResult {
    let contentDelta = ''
    let reasoningDelta = ''
    let hasThinkTag = currentState.isContentHasThinkTag
    let isInThinkTag = currentState.isContentHasThinkTag

    // 1. 使用 Think Tag Parser 处理 think tag
    if (chunk.content) {
      const thinkResult = this.thinkTagParser.parse(
        chunk.content,
        hasThinkTag
      )
      contentDelta = thinkResult.textDelta
      reasoningDelta = thinkResult.reasoningDelta
      hasThinkTag = thinkResult.hasThinkTag
      isInThinkTag = thinkResult.hasThinkTag
    }

    // 2. 使用 Content Parser 处理 reasoning 字段（如果有）
    if (chunk.reasoning && !reasoningDelta) {
      // 如果 think tag parser 没有产生 reasoningDelta，使用 reasoning 字段
      reasoningDelta = chunk.reasoning
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
