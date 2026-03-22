/**
 * Chunk 解析器
 * 协调所有子解析器，提供统一的解析接口
 */

import type { ToolCall } from '@main/services/agentCore/types'
import { ThinkTagParser } from './think-tag-parser'
import { ToolCallParser } from './tool-call-parser'
import { ParserState, createInitialParserState } from './parser-state'
import type { ChunkParser as IChunkParser, ParseResult, SegmentDelta } from './types'
import { ChunkParseError } from './errors'
import { parserLogger } from './logger'

/**
 * Chunk 解析器实现
 * 整合 think tag、tool call、content 解析
 */
export class ChunkParser implements IChunkParser {
  private thinkTagParser = new ThinkTagParser()
  private toolCallParser = new ToolCallParser()
  private parserState: ParserState

  constructor(initialState?: ParserState) {
    this.parserState = initialState || createInitialParserState()
  }

  /**
   * 解析单个响应 chunk
   */
  parse(chunk: IUnifiedResponse, toolCalls: ToolCall[]): ParseResult {
    try {
      let segmentDeltas: SegmentDelta[] = []

      // 1. 优先处理 reasoning 字段（如果有）
      if (chunk.reasoning) {
        segmentDeltas = [{ type: 'reasoning', content: chunk.reasoning }]
        // reasoning 字段存在时，不处理 content
      } else if (chunk.content) {
        // 2. 如果没有 reasoning 字段，使用 Think Tag Parser 处理 content
        segmentDeltas = this.thinkTagParser.parse(
          chunk.content,
          this.parserState
        )
      }

      // 3. 使用 Tool Call Parser 处理 tool calls
      const parsedToolCalls = this.toolCallParser.parse(
        chunk.toolCalls,
        toolCalls
      )

      return {
        contentDelta: segmentDeltas
          .filter(segment => segment.type === 'text')
          .map(segment => segment.content)
          .join(''),
        reasoningDelta: segmentDeltas
          .filter(segment => segment.type === 'reasoning')
          .map(segment => segment.content)
          .join(''),
        segmentDeltas,
        toolCalls: parsedToolCalls,
        hasThinkTag: this.parserState.isInThinkTag,
        isInThinkTag: this.parserState.isInThinkTag
      }
    } catch (error) {
      parserLogger.error('Failed to parse chunk', error as Error)
      throw new ChunkParseError(chunk, error as Error)
    }
  }

  /**
   * 获取当前 Parser 状态
   */
  getState(): ParserState {
    return this.parserState
  }

  /**
   * 设置 Parser 状态
   */
  setState(state: ParserState): void {
    this.parserState = state
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.parserState.reset()
  }
}
