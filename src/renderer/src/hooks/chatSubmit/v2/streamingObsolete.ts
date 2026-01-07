/**
 * Streaming V2 - 分层架构实现
 * 保持与现有接口完全兼容
 */

import { ConversationOrchestrator } from '../../chatSubmitObsolete/v2/streamingObsolete/orchestrator/conversation-orchestrator'
import { OrchestratorConfig } from '../../chatSubmitObsolete/v2/streamingObsolete/types'
import type {
  PreparedRequest,
  SendRequestStage,
  StreamingContext,
  StreamingDeps,
  StreamingFactoryCallbacks
} from './types'

/**
 * 创建 Streaming V2 实例
 * 使用新的分层架构，但保持与现有接口兼容
 *
 * @param deps 流式依赖
 * @param config 编排器配置（可选）
 * @returns SendRequestStage 函数
 */
export const createStreamingV2 =
  (deps: StreamingDeps, config?: OrchestratorConfig): SendRequestStage =>
    async (requestReady: PreparedRequest, callbacks?: StreamingFactoryCallbacks): Promise<StreamingContext> => {
      // 创建适配的 MessageManager（使用真实的 setMessages）
      const { MessageManager } = await import('../../chatSubmitObsolete/v2/streamingObsolete/state/message-manager')

      const messageManager = new MessageManager(
        requestReady.session.messageEntities,
        requestReady.request.messages,
        deps.setMessages
      )

      // 更新上下文，使用 message manager
      const adaptedContext: PreparedRequest = {
        ...requestReady,
        session: {
          ...requestReady.session,
          messageEntities: messageManager.messageEntities
        },
        request: {
          ...requestReady.request,
          messages: messageManager.requestMessages
        }
      }

      // 创建编排器
      const orchestrator = new ConversationOrchestrator(
        adaptedContext,
        {
          maxConcurrency: config?.maxConcurrency ?? 3,
          timeoutConfig: config?.timeoutConfig,
          retryConfig: config?.retryConfig
        },
        {
          onStateChange: callbacks?.onStateChange
        }
      )

      // 启动编排器
      const result = await orchestrator.start()

      // 确保 messages 已更新
      deps.setShowLoadingIndicator(false)

      return result
    }
