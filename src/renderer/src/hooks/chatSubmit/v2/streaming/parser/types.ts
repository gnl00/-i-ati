/**
 * Parser 层专用类型定义
 */

/**
 * 解析结果
 * 包含从单个 chunk 中提取的所有信息
 */
export interface ParseResult {
  /** 文本内容增量 */
  contentDelta: string
  /** 推理内容增量 */
  reasoningDelta: string
  /** 检测到的工具调用（累积的） */
  toolCalls: import('../../types').ToolCallProps[]
  /** 是否包含 think tag */
  hasThinkTag: boolean
  /** 是否正在 think tag 内部 */
  isInThinkTag: boolean
}

/**
 * Chunk 解析器接口
 */
export interface ChunkParser {
  /**
   * 解析单个响应 chunk
   * @param chunk 响应 chunk
   * @param currentState 当前流式状态
   * @returns 解析结果
   */
  parse(
    chunk: IUnifiedResponse,
    currentState: import('../../types').StreamingState
  ): ParseResult
}

/**
 * Segment 构建器接口
 */
export interface SegmentBuilder {
  /**
   * 追加 segment 到 segments 数组
   * @param segments 现有 segments
   * @param delta 内容增量
   * @param type segment 类型
   * @returns 更新后的 segments
   */
  appendSegment(
    segments: MessageSegment[],
    delta: string,
    type: 'text' | 'reasoning'
  ): MessageSegment[]
}
