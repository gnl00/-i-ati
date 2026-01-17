import { MessageManager } from '../message-manager'
import { StreamingOrchestrator } from './orchestrator'
import { ChunkParser } from './parser'
import type {
  PreparedRequest,
  SendRequestStage,
  StreamingContext,
  StreamingDeps,
  StreamingFactoryCallbacks,
} from '../types'

/**
 * 创建流式处理函数
 * 直接使用 StreamingOrchestrator 处理流式响应和工具调用循环
 */
export const createStreamingV2 = (deps: StreamingDeps): SendRequestStage => {
  return async (requestReady: PreparedRequest, callbacks?: StreamingFactoryCallbacks): Promise<StreamingContext> => {
    // 1. 初始化 streaming context
    const context: StreamingContext = {
      ...requestReady,
      streaming: { tools: [] }
    }

    // 2. 创建依赖
    const parser = new ChunkParser()
    const isStreamRequest = (requestReady.request as IUnifiedRequest).stream !== false
    const messageManager = new MessageManager(context, deps.store, {
      enableStreamBuffer: isStreamRequest,
      streamBufferMs: 40
    })

    // 3. 创建 orchestrator 并直接映射状态到外层
    const orchestrator = new StreamingOrchestrator({
      context,
      deps,
      parser,
      messageManager,
      signal: context.control.signal,
      callbacks: {
        onPhaseChange: (phase) => {
          // 直接映射 orchestrator 的 phase 到外层状态机
          if (phase === 'receiving') {
            callbacks?.onStateChange('streaming')
          } else if (phase === 'toolCall') {
            callbacks?.onStateChange('toolCall')
          }
        }
      }
    })

    // 4. 执行完整的请求-工具调用循环
    try {
      await orchestrator.execute()
    } finally {
      messageManager.flushPendingAssistantUpdate()
    }

    // 5. 清理状态
    deps.setShowLoadingIndicator(false)

    return context
  }
}
