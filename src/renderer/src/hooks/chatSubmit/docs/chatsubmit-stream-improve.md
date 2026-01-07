  一、架构概览

  当前实现是一个状态机驱动的 Pipeline 架构，数据流演进路径如下：

  useChatSubmit (Hook)
      ↓
  ChatPipelineMachineV2 (状态机)
      ↓
  PipelineBuilderV2 (数据容器)
      ↓
  ┌──────────────────────────────────────┐
  │  4个处理阶段：                         │
  │  1. prepareV2       → PreparedChat    │
  │  2. buildRequestV2  → PreparedRequest │
  │  3. createStreamingV2 → StreamingContext (已优化) │
  │  4. finalizePipelineV2 → void         │
  └──────────────────────────────────────┘

  数据结构演进链：
  PreparedChat
    → PreparedRequest (增加 request 字段)
      → StreamingContext (增加 streaming 状态)

  二、当前架构的优点 ✅

  1. 清晰的阶段划分 - prepare → request → streaming → finalize，职责明确
  2. 类型安全 - 完善的 TypeScript 类型定义，每个阶段都有明确的输入输出
  3. 状态管理良好 - PipelineBuilder 提供了统一的 state 容器
  4. 可观测性强 - 状态机提供 subscribe 机制，便于监控和调试
  5. Parser 层已优化 - 消息解析逻辑已独立，易于测试和维护

  三、当前架构的痛点 ⚠️

  1. 状态同步混乱（最严重）

  在 streaming.ts 中有多处手动同步：

  // 流式处理中需要同时更新3个地方
  context.session.messageEntities = updatedMessages      // ← 同步1
  context.session.chatMessages = updatedMessages.map(...) // ← 同步2
  setMessages(updatedMessages)                           // ← 同步3

  这在 handleToolCalls 中也重复出现了3次（287-289行，304-306行，368-370行）。

  问题：
  - 容易遗漏同步导致状态不一致
  - 代码冗余，维护成本高
  - 容易出现 bug（如之前 applyParseResult 的 bug）

  2. 工具执行逻辑混杂（中等）

  StreamingSessionMachine.handleToolCalls() (217-311行) 职责过多：
  - 串行执行工具
  - 错误处理
  - 更新 segments
  - 构造 tool result messages
  - 同步状态（3次）

  问题：
  - 难以并行化工具执行
  - 测试困难（需要 mock 整个 context）
  - 错误处理逻辑与业务逻辑混杂

  3. finalize 阶段绕过了 builder（轻微）

  // finalize.ts:86
  const currentMessages = useChatStore.getState().messages  // ← 直接访问 store

  这违背了 pipeline 的设计原则（应该通过 builder 获取 context）。

  4. 缺乏错误恢复机制

  - 网络错误后无法重试
  - 工具调用失败后直接跳过，无法回滚

  ---
  🎯 优化方案一：基于当前方案的渐进式优化

  目标

  保持当前架构不变，逐步消除痛点。

  Phase 1: 统一状态管理（优先级：高）

  问题：多处手动同步 messageEntities 和 chatMessages

  方案：创建 MessageManager 类，封装所有消息更新逻辑
  
  Phase 2: 抽取 ToolExecutor 层（优先级：中）

  问题：handleToolCalls 职责过多，难以扩展

  方案：创建独立的 ToolExecutor 类

  // 新文件：v2/streaming/tool-executor.ts

  interface ToolExecutionResult {
    success: boolean
    name: string
    content: any
    cost: number
    error?: Error
  }

  class ToolExecutor {
    /**
     * 并发执行工具调用
     */
    async executeTools(
      toolCalls: ToolCallProps[],
      signal: AbortSignal,
      onProgress: (result: ToolExecutionResult) => void
    ): Promise<ToolExecutionResult[]> {

      // 使用 Promise.allSettled 并发执行
      const executions = toolCalls.map(tc =>
        this.executeSingleTool(tc, signal)
      )

      const results = await Promise.allSettled(executions)

      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          return {
            success: false,
            name: toolCalls[index].function,
            content: null,
            cost: 0,
            error: result.reason
          }
        }
      })
    }

    private async executeSingleTool(
      toolCall: ToolCallProps,
      signal: AbortSignal
    ): Promise<ToolExecutionResult> {
      const startTime = Date.now()

      if (signal.aborted) {
        throw new AbortError()
      }

      try {
        // ... 执行逻辑（从 handleToolCalls 迁移）
        const results = await this.invokeTool(toolCall)
        const cost = Date.now() - startTime

        return {
          success: true,
          name: toolCall.function,
          content: results,
          cost
        }
      } catch (error) {
        return {
          success: false,
          name: toolCall.function,
          content: null,
          cost: Date.now() - startTime,
          error: error as Error
        }
      }
    }
  }

  修改 streaming.ts：
  // 旧代码（217-311行）
  private async handleToolCalls() {
    const toolRuntime = this.context.streaming.tools
    while (toolRuntime.toolCalls.length > 0) {
      // ... 100行串行执行逻辑
    }
  }

  // 新代码
  private async handleToolCalls() {
    const executor = new ToolExecutor()
    const results = await executor.executeTools(
      this.context.streaming.tools.toolCalls,
      this.context.control.signal,
      (result) => {
        // 实时更新 segments 到 UI
        this.messageManager.appendSegmentToLastMessage({
          type: 'toolCall',
          name: result.name,
          content: result.content,
          cost: result.cost,
          timestamp: Date.now()
        })
      }
    )

    // 批量添加 tool result messages
    results.forEach(result => {
      const toolMsg: ChatMessage = {
        role: 'tool',
        name: result.name,
        toolCallId: '...',
        content: handleToolCallResult(result.name, result.content),
        segments: []
      }
      this.messageManager.addToolResultMessage(toolMsg)
    })
  }

  收益：
  - 代码行数减少 60%（从 100 行减少到 40 行）
  - 支持并发工具执行（性能提升）
  - 错误处理统一
  - 易于测试

  Phase 3: 修复 finalize 依赖（优先级：低）

  问题：finalize.ts 直接访问 useChatStore.getState()

  方案：通过 builder 传递完整的 context

  // 修改 finalize.ts
  export const finalizePipelineV2 = async (
    builder: StreamingContextProvider,
    deps: FinalizeDeps
  ): Promise<void> => {
    const context = builder.requireStreamingContext()

    // ❌ 删除这行
    // const currentMessages = useChatStore.getState().messages

    // ✅ 使用 context 中的数据
    const lastMessage = context.session.messageEntities[context.session.messageEntities.length - 1]

    // ... 其他逻辑
  }

  收益：
  - 符合 pipeline 设计原则
  - 减少对全局 store 的依赖

  ---
  🚀 优化方案二：更激进的架构重构

  核心思想

  引入事件驱动架构，将状态同步改为响应式更新。

  架构设计

  ┌─────────────────────────────────────────────────────────┐
  │          EventBus (事件总线)                             │
  │  - message.updated                                      │
  │  - message.segmentAppended                              │
  │  - toolCall.completed                                   │
  │  - toolCall.failed                                      │
  └────────────┬────────────────────────────────────────────┘
               │ 订阅
               ▼
  ┌─────────────────────────────────────────────────────────┐
  │          Store (响应式状态)                              │
  │  ┌──────────────────────────────────────────────────┐  │
  │  │  自动同步：                                       │  │
  │  │  - messageEntities → chatMessages                  │  │
  │  │  - segments → UI                                   │  │
  │  └──────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────┘

  实现示例

  // 新文件：v2/event-bus.ts

  type EventMap = {
    'message.updated': MessageEntity[]
    'message.segmentAppended': { messageIndex: number; segment: MessageSegment }
    'toolCall.completed': ToolExecutionResult
    'toolCall.failed': { error: Error; toolName: string }
  }

  class EventBus {
    private listeners = new Map<keyof EventMap, Set<Function>>()

    on<K extends keyof EventMap>(
      event: K,
      handler: (data: EventMap[K]) => void
    ) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set())
      }
      this.listeners.get(event)!.add(handler)
    }

    emit<K extends keyof EventMap>(
      event: K,
      data: EventMap[K]
    ) {
      this.listeners.get(event)?.forEach(handler => handler(data))
    }
  }

  // 使用示例
  const bus = new EventBus()

  // 在 applyParseResult 中
  bus.emit('message.segmentAppended', {
    messageIndex: -1,  // 最后一条消息
    segment: { type: 'text', content: delta, timestamp: Date.now() }
  })

  // Store 订阅事件
  bus.on('message.segmentAppended', ({ messageIndex, segment }) => {
    const entities = useChatStore.getState().messages
    const lastEntity = entities[entities.length - 1]

    if (!lastEntity.body.segments) {
      lastEntity.body.segments = []
    }
    lastEntity.body.segments.push(segment)

    // 自动同步到 chatMessages
    useChatStore.getState().setMessages([...entities])
  })

  优势

  1. 完全解耦 - Parser、ToolExecutor、Store 之间通过事件通信
  2. 自动同步 - Store 订阅事件后自动更新，无需手动同步
  3. 易于扩展 - 添加新功能（如日志、监控）只需订阅事件
  4. 更好的测试性 - 可以测试事件触发，无需 mock 整个 context

  劣势

  1. 复杂度增加 - 需要理解事件驱动模式
  2. 调试难度 - 事件流不如直接调用直观
  3. 重构成本高 - 需要改写大量现有代码
  4. 可能过度设计 - 对于当前规模可能不够实用

  ---
  📝 推荐实施路径

  建议：采用方案一（渐进式优化）

  理由：
  1. 风险低 - 保持现有架构，逐步改进
  2. 收益明确 - 每个 phase 都有清晰的收益
  3. 易于回滚 - 如果某个 phase 有问题，可以快速回退
  4. 符合当前规模 - 不会过度设计

  实施顺序

  Phase 1: MessageManager (1-2天)
    ↓
  Phase 2: ToolExecutor (2-3天)
    ↓
  Phase 3: 修复 finalize (半天)
    ↓
    总结和测试 (1天)

  总计：5-6天

  何时考虑方案二

  只有当满足以下所有条件时，才建议考虑方案二：
  - ✅ 方案一全部完成，且验证了收益
  - ✅ 团队规模扩大（>3人同时开发此模块）
  - ✅ 需要添加复杂的异步协调（如多轮对话、分支处理）
  - ✅ 需要强大的可观测性（如日志、指标、tracing）

  ---
  总结

  | 维度       | 当前状态 | 方案一优化后          | 方案二优化后     |
  |------------|----------|-----------------------|------------------|
  | 代码行数   | 337 行   | ~280 行 (↓17%)        | ~350 行 (↑4%)    |
  | 状态同步点 | 9 处     | 1 处 (MessageManager) | 0 处（事件驱动） |
  | 工具执行   | 串行     | 并发                  | 并发             |
  | 可测试性   | 中       | 高                    | 极高             |
  | 复杂度     | 中       | 中                    | 高               |
  | 实施风险   | 低       | 低                    | 高               |

  我的建议：先执行方案一，根据实际效果再决定是否需要方案二。

  你觉得如何？我们可以先从 Phase 1 (MessageManager) 开始吗？