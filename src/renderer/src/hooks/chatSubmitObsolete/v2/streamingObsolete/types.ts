/**
 * Streaming V2 架构专用类型定义
 * 分层架构 + 责任链模式
 */

// ============ 传输层类型 ============

/**
 * 流式传输接口
 * 统一的流式请求抽象
 */
export interface StreamTransport {
  /**
   * 发起流式请求
   * @param req 统一请求对象
   * @param signal 中断信号
   * @returns 异步迭代器，产生响应 chunk
   */
  request(
    req: IUnifiedRequest,
    signal: AbortSignal
  ): AsyncIterable<IUnifiedResponse>
}

// ============ 解析层类型 ============

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
  toolCalls: import('../../../chatSubmit/v2/types').ToolCallProps[]
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
    currentState: import('../../../chatSubmit/v2/types').StreamingState
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

// ============ 工具执行层类型 ============

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  /** 工具名称 */
  name: string
  /** 工具返回内容 */
  content: any
  /** 执行耗时（毫秒） */
  cost: number
  /** 错误信息（如果执行失败） */
  error?: Error
}

/**
 * 工具执行器接口
 */
export interface ToolExecutor {
  /**
   * 执行多个工具调用
   * @param calls 工具调用列表
   * @returns 执行结果列表
   */
  execute(calls: import('../../../chatSubmit/v2/types').ToolCallProps[]): Promise<ToolExecutionResult[]>
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number
  /** 初始重试延迟（毫秒） */
  initialDelay: number
  /** 退避因子（指数退避） */
  backoffFactor: number
  /** 最大重试延迟（毫秒） */
  maxDelay: number
}

/**
 * 超时配置
 */
export interface TimeoutConfig {
  /** 超时时间（毫秒） */
  timeout: number
  /** 是否在超时后重试 */
  retryOnTimeout: boolean
}

// ============ 状态管理层类型 ============

/**
 * 消息更新器类型
 */
export type MessageUpdater = (message: MessageEntity) => MessageEntity

/**
 * 消息管理器接口
 */
export interface MessageManager {
  /**
   * 更新最后一条消息
   * @param updater 更新函数
   */
  updateLastMessage(updater: MessageUpdater): void

  /**
   * 添加消息到请求历史
   * @param message 聊天消息
   */
  appendMessageToRequest(message: ChatMessage): void

  /**
   * 获取聊天消息列表
   */
  get chatMessages(): ChatMessage[]

  /**
   * 获取消息实体列表
   */
  get messageEntities(): MessageEntity[]

  /**
   * 设置消息实体列表
   */
  set messageEntities(messages: MessageEntity[])
}

// ============ 编排层类型 ============

/**
 * 编排器阶段
 */
export type OrchestratorPhase = 'idle' | 'streaming' | 'toolExecuting' | 'completed'

/**
 * 编排器配置
 */
export interface OrchestratorConfig {
  /** 最大并发工具数 */
  maxConcurrency?: number
  /** 工具执行超时（毫秒） */
  toolTimeout?: number
  /** 工具重试次数 */
  toolRetries?: number
}

/**
 * 编排器回调
 */
export interface OrchestratorCallbacks {
  /** 状态变化回调 */
  onStateChange?: (state: 'streaming' | 'toolCall') => void
}
