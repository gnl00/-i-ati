import { MessageManager } from './streaming/message-manager'
import { StreamingOrchestrator } from './streaming/orchestrator'
import { ChunkParser } from './streaming/parser'
import type {
  PreparedRequest,
  SendRequestStage,
  StreamingContext,
  StreamingDeps,
  StreamingFactoryCallbacks,
  StreamingState
} from './types'

/**
 * 创建初始流式状态
 */
const createInitialStreamingState = (): StreamingState => ({
  tools: []
})

/**
 * 创建流式处理函数
 * 直接使用 StreamingOrchestrator 处理流式响应和工具调用循环
 */
export const createStreamingV2 = (deps: StreamingDeps): SendRequestStage => {
  return async (requestReady: PreparedRequest, callbacks?: StreamingFactoryCallbacks): Promise<StreamingContext> => {
    // 1. 初始化 streaming context
    const context: StreamingContext = {
      ...requestReady,
      streaming: createInitialStreamingState()
    }

    // 2. 创建依赖
    const parser = new ChunkParser()
    const messageManager = new MessageManager(context, deps.store)

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
    await orchestrator.execute()

    // 5. 清理状态
    deps.setShowLoadingIndicator(false)

    return context
  }
}
