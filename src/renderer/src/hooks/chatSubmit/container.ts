import { useChatContext } from '@renderer/context/ChatContext'
import { type ChatStore } from '@renderer/store'
import { AppConfigStore } from '@renderer/store/appConfig'
import { finalizePipelineV2 } from './finalize'
import { Logger } from './logger'
import { ChatPipelineMachineV2 } from './machine'
import { prepareV2 } from './prepare'
import { buildRequestV2 } from './request'
import { createStreamingV2 } from './streaming'
import type { FinalizeDeps, PrepareMessageParams, StreamingDeps } from './types'

/**
 * 聊天依赖容器
 * 负责管理 useChatSubmit 所需的所有依赖和参数构建
 */
export class ChatDependencyContainer {
  private readonly logger = new Logger({ prefix: '[Container]' })

  constructor(
    private readonly chatContext: ReturnType<typeof useChatContext>,
    private readonly chatStore: ChatStore,
    private readonly appConfig: AppConfigStore
  ) {
    this.logger.debug('Created new instance')
  }

  /**
   * 构建准备阶段参数
   */
  buildPrepareParams(input: {
    textCtx: string
    mediaCtx: ClipbordImg[] | string[]
    tools?: any[]
    prompt?: string
  }): PrepareMessageParams {
    this.logger.debug('Building prepare params', {
      hasText: !!input.textCtx,
      mediaCount: input.mediaCtx.length,
      toolsCount: input.tools?.length || 0,
      hasPrompt: !!input.prompt
    })

    return {
      input,
      model: this.chatStore.selectedModel!,
      chat: {
        chatId: this.chatContext.chatId,
        chatUuid: this.chatContext.chatUuid,
        setChatId: this.chatContext.setChatId,
        setChatUuid: this.chatContext.setChatUuid,
        updateChatList: this.chatContext.updateChatList
      },
      store: this.chatStore,
      providers: this.appConfig.providers
    }
  }

  /**
   * 构建收尾阶段参数
   */
  buildFinalizeDeps(): FinalizeDeps {
    this.logger.debug('Building finalize deps', {
      hasChatTitle: !!this.chatContext.chatTitle,
      titleGenerateEnabled: this.appConfig.titleGenerateEnabled
    })

    return {
      chatTitle: this.chatContext.chatTitle,
      setChatTitle: this.chatContext.setChatTitle,
      setLastMsgStatus: this.chatContext.setLastMsgStatus,
      setReadStreamState: this.chatStore.setReadStreamState,
      updateChatList: this.chatContext.updateChatList,
      titleGenerateEnabled: this.appConfig.titleGenerateEnabled,
      titleGenerateModel: this.appConfig.titleGenerateModel,
      selectedModel: this.chatStore.selectedModel,
      providers: this.appConfig.providers,
      store: this.chatStore
    }
  }

  /**
   * 构建流式处理参数
   */
  buildStreamingDeps(): StreamingDeps {
    this.logger.debug('Building streaming deps')

    return {
      setMessages: this.chatStore.setMessages,
      setShowLoadingIndicator: this.chatStore.setShowLoadingIndicator,
      beforeFetch: () => this.beforeFetch(),
      afterFetch: () => this.afterFetch(),
      store: this.chatStore
    }
  }

  /**
   * 请求前钩子
   */
  beforeFetch(): void {
    this.logger.debug('Before fetch - setting fetch state to true')
    this.chatStore.setFetchState(true)
  }

  /**
   * 请求后钩子
   */
  afterFetch(): void {
    this.logger.debug('After fetch - setting fetch state to false')
    this.chatStore.setFetchState(false)
  }

  /**
   * 重置所有状态
   */
  resetStates(): void {
    this.logger.debug('Resetting all states')

    this.chatStore.setCurrentReqCtrl(undefined)
    this.chatStore.setReadStreamState(false)
    this.chatStore.setFetchState(false)
    this.chatStore.setShowLoadingIndicator(false)
    this.chatContext.setLastMsgStatus(false)
  }

  /**
   * 创建 Pipeline Machine 实例
   */
  createMachine(): ChatPipelineMachineV2 {
    this.logger.debug('Creating pipeline machine')

    return new ChatPipelineMachineV2({
      prepare: prepareV2,
      buildRequest: buildRequestV2,
      sendRequest: createStreamingV2(this.buildStreamingDeps()),
      finalize: finalizePipelineV2
    })
  }
}
