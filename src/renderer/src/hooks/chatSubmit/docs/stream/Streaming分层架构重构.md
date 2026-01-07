Streaming V2 实现计划：分层架构重构

目标

基于分层架构 + 责任链模式重构
streaming.ts，解决当前架构的职责混杂、工具串行执行、代码重复、数据同步混乱等问题。

架构设计

分层架构图

┌─────────────────────────────────────────────────────────────────┐
│                   应用层          │
│  - useChatSubmitV2 Hook                                        │
│  - ChatPipelineMachineV2 状态机                                │
└──────────────────────────────────┬──────────────────────────────┘
                                  │
┌──────────────────────────────────▼──────────────────────────────┐
│                 编排层          │
│  - ConversationOrchestrator: 协调整个流程                      │
│  - 主循环: 请求 → 解析 → 工具执行 → 重复/完成                   │
└──────────────────────────────────┬──────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
┌────────▼────────┐      ┌────────▼────────┐      ┌─────────▼────────┐
│  解析层         │      │  工具执行层      │      │  状态管理层       │
│  (Parser)       │      │  (ToolExecutor) │      │  (StateManager)  │
├─────────────────┤      ├─────────────────┤      ├──────────────────┤
│• ChunkParser    │      │• ParallelExec   │      │• MessageManager  │
│  - ThinkTag     │      │  - 并行工具      │      │  - 统一消息更新  │
│  - ToolCall     │      │  - 重试/超时     │      │• 同步管理        │
│  - Content      │      │  - 结果聚合      │      │  - 消除手动同步  │
│• SegmentBuilder │      │• ErrorRecovery  │      │• 原子更新        │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  │
┌──────────────────────────────────▼──────────────────────────────┐
│                 传输层             │
│  - StreamTransport: 统一流式接口                              │
│  - unifiedChatRequest 适配                                   │
└─────────────────────────────────────────────────────────────────┘

核心接口设计

1. 传输层 (Transport Layer)

// transport/stream-transport.ts
interface StreamTransport {
  request(req: IUnifiedRequest, signal: AbortSignal): AsyncIterable<IUnifiedResponse>
}

class UnifiedChatTransport implements StreamTransport {
  constructor(
    private beforeFetch: () => void,
    private afterFetch: () => void
  ) {}

  async *request(req: IUnifiedRequest, signal: AbortSignal): AsyncIterable<IUnifiedResponse> {
    this.beforeFetch()
    try {
      const response = await unifiedChatRequest(req, signal, this.beforeFetch, this.afterFetch)
      if (req.stream === false) {
        yield response as IUnifiedResponse
      } else {
        for await (const chunk of response as AsyncIterable<IUnifiedResponse>) {
          yield chunk
        }
      }
    } finally {
      this.afterFetch()
    }
  }
}

2. 解析层 (Parser Layer)

// parser/chunk-parser.ts
interface ParseResult {
  contentDelta: string
  reasoningDelta: string
  toolCalls: ToolCallProps[]
  hasThinkTag: boolean
}

interface ChunkParser {
  parse(chunk: IUnifiedResponse, currentState: StreamingState): ParseResult
}

// parser/think-tag-parser.ts
class ThinkTagParser {
  parse(chunk: IUnifiedResponse, state: StreamingState): { reasoningDelta: string, hasThinkTag: boolean } {
    // 专门处理 </think> 标签逻辑
  }
}

// parser/tool-call-parser.ts
class ToolCallParser {
  parse(chunk: IUnifiedResponse, state: StreamingState): { toolCalls: ToolCallProps[] } {
    // 累积 tool call 参数
  }
}

// parser/content-parser.ts
class ContentParser {
  parse(chunk: IUnifiedResponse, state: StreamingState): { contentDelta: string, reasoningDelta: string } {
    // 处理普通内容和推理内容
  }
}

// parser/segment-builder.ts
class SegmentBuilder {
  appendSegment(
    segments: MessageSegment[],
    delta: string,
    type: 'text' | 'reasoning'
  ): MessageSegment[] {
    // 合并或创建新 segment
  }
}

3. 工具执行层 (Tool Executor Layer)

// executor/tool-executor.ts
interface ToolExecutionResult {
  name: string
  content: any
  cost: number
  error?: Error
}

interface ToolExecutor {
  execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]>
}

class ParallelToolExecutor implements ToolExecutor {
  constructor(
    private maxConcurrency: number = 3,
    private timeout: number = 30000,
    private retries: number = 2
  ) {}

  async execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]> {
    const results = await Promise.allSettled(
      calls.map(call => this.executeOne(call))
    )
    return results.map(this.handleResult)
  }

  private async executeOne(call: ToolCallProps): Promise<ToolExecutionResult> {
    // 带重试、超时的执行逻辑
    const startTime = Date.now()
    try {
      let result: any
      if (embeddedToolsRegistry.isRegistered(call.function)) {
        result = await this.withTimeout(
          this.withRetry(() => embeddedToolsRegistry.execute(call.function, call.args))
        )
      } else {
        result = await this.withTimeout(
          this.withRetry(() => invokeMcpToolCall({ callId: call.id, tool: call.function, args: call.args }))
        )
      }
      return { name: call.function, content: result, cost: Date.now() - startTime }
    } catch (error) {
      return { name: call.function, content: null, cost: Date.now() - startTime, error }
    }
  }
}

4. 状态管理层 (State Manager Layer)

// state/message-manager.ts
class MessageManager {
  private messageEntities: MessageEntity[]
  private setMessages: (msgs: MessageEntity[]) => void

  updateLastMessage(updater: (msg: MessageEntity) => MessageEntity) {
    const updated = [...this.messageEntities]
    updated[updated.length - 1] = updater(updated[updated.length - 1])
    this.applyUpdate(updated)
  }

  appendMessageToRequest(msg: ChatMessage) {
    // 自动同步到 request.messages
  }

  private applyUpdate(updated: MessageEntity[]) {
    this.messageEntities = updated
    this.setMessages(updated)
    // 不再需要手动更新 chatMessages，由 getter 提供
  }

  get chatMessages(): ChatMessage[] {
    return this.messageEntities.map(msg => msg.body)
  }
}

5. 编排层 (Orchestrator Layer)

// orchestrator/conversation-orchestrator.ts
class ConversationOrchestrator {
  private phase: 'idle' | 'streaming' | 'toolExecuting' | 'completed' = 'idle'
  private parser: ChunkParser
  private toolExecutor: ToolExecutor
  private transport: StreamTransport
  private stateManager: MessageManager

  async start(context: PreparedRequest): Promise<StreamingContext> {
    let currentRequest = context

    while (true) {
      // 1. 发起请求
      this.transition('streaming')
      const stream = this.transport.request(currentRequest.request, currentRequest.control.signal)

      // 2. 解析流式响应
      for await (const chunk of stream) {
        const parsed = this.parser.parse(chunk, context.streaming)
        this.stateManager.updateLastMessage(msg => this.applyParsedData(msg, parsed))
      }

      // 3. 检查工具调用
      if (context.streaming.tools.toolCalls.length === 0) {
        break
      }

      // 4. 执行工具（并行）
      this.transition('toolExecuting')
      const results = await this.toolExecutor.execute(context.streaming.tools.toolCalls)
      this.addToolResultsToMessage(results)

      // 5. 构建下一次请求
      currentRequest = this.buildNextRequest(currentRequest, results)
    }

    this.transition('completed')
    return context
  }

  private transition(phase: typeof this.phase) {
    this.phase = phase
    this.callbacks?.onStateChange(phase === 'toolExecuting' ? 'toolCall' : 'streaming')
  }
}

文件组织结构

src/renderer/src/hooks/chatSubmit/
├── streaming.ts                      # 保留原实现（备份）
├── streaming-v2.ts                   # 新实现入口（兼容层）
├── v2/
│   ├── index.ts                      # 导出 useChatSubmitV2
│   ├── transport/
│   │   ├── index.ts
│   │   └── stream-transport.ts       # StreamTransport 实现
│   ├── parser/
│   │   ├── index.ts
│   │   ├── chunk-parser.ts           # ChunkParser 协调器
│   │   ├── think-tag-parser.ts       # Think tag 解析
│   │   ├── tool-call-parser.ts       # Tool call 累积
│   │   ├── content-parser.ts         # 内容解析
│   │   └── segment-builder.ts        # Segment 构建
│   ├── executor/
│   │   ├── index.ts
│   │   ├── tool-executor.ts          # ToolExecutor 接口
│   │   ├── parallel-executor.ts      # 并行执行实现
│   │   ├── retry-decorator.ts        # 重试装饰器
│   │   └── timeout-decorator.ts      # 超时装饰器
│   ├── state/
│   │   ├── index.ts
│   │   ├── message-manager.ts        # MessageManager
│   │   └── state-sync.ts             # 状态同步辅助
│   ├── orchestrator/
│   │   ├── index.ts
│   │   └── conversation-orchestrator.ts  # ConversationOrchestrator
│   ├── types.ts                      # 现有类型
│   ├── utils.ts                      # 现有工具函数
│   ├── errors.ts                     # 现有错误定义
│   └── streaming-v2-types.ts         # 新架构专用类型

实现步骤

Phase 1: 传输层 (1-2小时)

文件: transport/stream-transport.ts

1. 创建 StreamTransport 接口
2. 实现 UnifiedChatTransport 类
3. 封装 unifiedChatRequest 调用
4. 处理 abort signal
5. 统一 AsyncIterable 接口
6. 单元测试

验收标准:
- ✅ 能够发起流式请求
- ✅ 支持 abort
- ✅ 统一的 AsyncIterable 接口

Phase 2: 解析层 (2-3小时)

文件: parser/ 目录

1. think-tag-parser.ts
  - 检测 </think> 标签
  - 处理标签跨 chunk 的情况
  - 状态机：normal → inThink → normal
2. tool-call-parser.ts
  - 累积 tool call 参数
  - 处理 index 和 id 匹配
  - 返回完整的 ToolCallProps[]
3. content-parser.ts
  - 根据当前状态分配 content/reasoning
  - 与 think-tag-parser 协作
4. segment-builder.ts
  - appendSegment() 方法
  - 智能合并同类型 segment
  - 创建新 segment
5. chunk-parser.ts
  - 协调上述 parser
  - 返回统一的 ParseResult

验收标准:
- ✅ Think tag 正确解析
- ✅ Tool call 参数正确累积
- ✅ Segments 正确合并和创建

Phase 3: 状态管理层 (1-2小时)

文件: state/message-manager.ts

1. 创建 MessageManager 类
2. 实现 updateLastMessage() 方法
3. 实现 appendMessageToRequest() 方法
4. 消除所有手动同步代码
5. 提供 chatMessages getter

验收标准:
- ✅ 一次更新，自动同步
- ✅ 无重复代码
- ✅ 易于测试

Phase 4: 工具执行层 (2-3小时)

文件: executor/ 目录

1. tool-executor.ts
  - 定义 ToolExecutor 接口
  - 定义 ToolExecutionResult 类型
2. parallel-executor.ts
  - 实现 ParallelToolExecutor
  - 使用 Promise.allSettled() 并行执行
  - 错误不中断其他工具
3. retry-decorator.ts
  - 实现重试逻辑
  - 指数退避策略
  - 最大重试次数限制
4. timeout-decorator.ts
  - 实现 withTimeout() 包装器
  - 超时后抛出错误

验收标准:
- ✅ 工具并行执行
- ✅ 失败重试机制
- ✅ 超时控制

Phase 5: 编排层 (2-3小时)

文件: orchestrator/conversation-orchestrator.ts

1. 创建 ConversationOrchestrator 类
2. 实现主循环：请求 → 解析 → 工具 → 重复
3. 状态转换逻辑
4. 集成各层组件
5. 错误处理和恢复

验收标准:
- ✅ 完整的对话流程
- ✅ 正确的状态转换
- ✅ 错误不崩溃

Phase 6: 兼容层 (1小时)

文件: streaming-v2.ts

1. 创建 createStreamingV2() 工厂函数
2. 实现 SendRequestStage 接口
3. 使用新架构内部实现
4. 保持外部接口不变

验收标准:
- ✅ 与现有代码完全兼容
- ✅ 无需修改上层调用

Phase 7: 集成测试 (1-2小时)

1. 端到端测试
2. 并行工具调用测试
3. Think tag 解析测试
4. 错误恢复测试
5. Abort 测试

关键实现细节

1. Think Tag 解析状态机

enum ThinkTagState {
  Normal = 'normal',
  InThink = 'inThink',
  ThinkClosed = 'thinkClosed'
}

class ThinkTagParser {
  private state = ThinkTagState.Normal
  private buffer = ''

  parse(content: string): { reasoningDelta: string, textDelta: string } {
    // 处理跨 chunk 的标签
  }
}

2. 并行工具执行

// 并行执行，但限制并发数
async execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]> {
  const chunks = this.chunk(calls, this.maxConcurrency)
  const results: ToolExecutionResult[] = []

  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map(call => this.executeOne(call))
    )
    results.push(...chunkResults.map(r => this.handleSettledResult(r)))
  }

  return results
}

3. 消息更新原子化

// 旧方式（3次手动同步）
this.context.session.messageEntities = updatedMessages
this.context.session.chatMessages = updatedMessages.map(msg => msg.body)
this.deps.setMessages(updatedMessages)

// 新方式（1次更新）
this.stateManager.updateLastMessage(msg => ({
  ...msg,
  body: { ...msg.body, segments: newSegments }
}))

4. Segment 合并策略

appendSegment(segments: MessageSegment[], delta: string, type: 'text' | 'reasoning'): MessageSegment[] {
  const lastSegment = segments[segments.length - 1]

  if (lastSegment?.type === type) {
    // 合并到最后一个 segment
    return [
      ...segments.slice(0, -1),
      { ...lastSegment, content: (lastSegment.content || '') + delta }
    ]
  } else {
    // 创建新 segment
    return [...segments, { type, content: delta, timestamp: Date.now() }]
  }
}

错误处理策略

传输层

- 网络错误：向上抛出，由编排层决定是否重试
- AbortError：捕获并优雅退出

解析层

- 解析错误：记录警告，跳过该 chunk
- 不影响整体流程

工具执行层

- 工具失败：返回 error 字段，不中断其他工具
- 超时：返回 timeout error
- 重试：仅对可重试错误（网络超时等）

编排层

- 工具全部失败：终止对话，通知用户
- 部分失败：继续对话，记录错误

性能优化

1. 批量 UI 更新
  - 收集多个 chunk 后批量更新 UI
  - 使用 requestAnimationFrame 节流
2. 并行工具调用
  - 独立工具并行执行
  - 限制最大并发数（默认 3）
3. 减少对象创建
  - 复用 buffer 对象
  - 避免不必要的数组拷贝

测试策略

单元测试

- 每层的独立测试
- Mock 依赖
- 覆盖率 > 80%

集成测试

- 端到端流程测试
- 真实工具调用测试
- 错误场景测试

性能测试

- 大量工具调用性能
- 长对话流式性能
- 内存泄漏检测

向后兼容

保留的接口

// 完全兼容现有接口
type SendRequestStage = (
  context: PreparedRequest,
  callbacks: StreamingFactoryCallbacks
) => Promise<StreamingContext>

export const createStreamingV2 = (deps: StreamingDeps): SendRequestStage => {
  return async (requestReady, callbacks) => {
    // 使用新架构实现
  }
}