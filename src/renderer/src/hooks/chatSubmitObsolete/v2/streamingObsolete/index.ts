/**
 * V2 架构统一入口
 * Export all V2 components
 */

// 编排层
export { ConversationOrchestrator } from './orchestrator/conversation-orchestrator'

// 解析层
export {
  ChunkParser, ContentParser, SegmentBuilder,
  ThinkTagParser,
  ToolCallParser
} from './parser'

// 状态管理层
export { MessageManager } from './state'

// 工具执行层
export {
  ParallelToolExecutor, ToolExecutor, withRetry,
  withTimeout
} from './executor'

// 传输层
export { UnifiedChatTransport } from './transport'
