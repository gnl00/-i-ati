⏺ 基于对代码的分析，我发现以下可以优化的方面：

  一、性能优化

  1. 频繁的重渲染问题

  // 当前实现：每个 chunk 都触发一次 setMessages
  handleStreamingChunk(this.context, chunk, this.deps.setMessages)

  建议：
  - 实现批量更新或节流机制
  - 使用 requestAnimationFrame 或定时器批量更新 UI
  - 减少不必要的数组拷贝和对象创建

  2. 工具调用串行执行

  // 当前：串行执行每个工具调用
  while (toolRuntime.toolCalls.length > 0) {
    const toolCall = toolRuntime.toolCalls.shift()
    await executeToolCall(toolCall)  // 逐个等待
  }

  建议：
  - 对于独立的工具调用，可以并行执行
  - 使用 Promise.all() 或 Promise.allSettled() 提升性能

  3. 重复的数据转换

  // 每次都要转换
  context.session.chatMessages = updatedMessages.map(msg => msg.body)

  建议：考虑使用 getter 或代理按需转换

  二、代码质量

  4. 重复的 segment 处理逻辑

  // reasoning 和 text 的处理逻辑几乎一样（line 104-140）
  if (reasoningDelta.trim()) {
    // ... 合并逻辑
  }
  if (textDelta.trim()) {
    // ... 几乎相同的合并逻辑
  }

  建议：抽取通用函数
  private mergeSegment(segments: Segment[], delta: string, type: 'text' | 'reasoning') {
    const lastIndex = segments.length - 1
    const lastSegment = segments[lastIndex]

    if (lastSegment?.type === type) {
      segments[lastIndex] = {
        ...lastSegment,
        content: (lastSegment.content || '') + delta
      }
    } else {
      segments.push({ type, content: delta, timestamp: Date.now() })
    }

    return segments
  }

  5. 消息更新逻辑重复

  在多处出现类似的模式：
  const updatedMessages = [...this.context.session.messageEntities]
  // ... 修改 updatedMessages
  this.deps.setMessages(updatedMessages)
  this.context.session.messageEntities = updatedMessages
  this.context.session.chatMessages = updatedMessages.map(msg => msg.body)

  建议：封装为方法
  private updateMessages(updater: (msgs: MessageEntity[]) => MessageEntity[]) {
    const updated = updater(this.context.session.messageEntities)
    this.context.session.messageEntities = updated
    this.context.session.chatMessages = updated.map(msg => msg.body)
    this.deps.setMessages(updated)
  }

  6. 过长的函数

  - handleStreamingChunk: 113 行
  - handleToolCalls: 95 行

  建议：拆分为更小的单一职责函数

  三、错误处理

  7. 工具调用错误处理不完善

  catch (error: any) {
    console.error('Tool call error:', error)
    // 只更新消息，没有通知用户或记录错误结果
  }

  建议：
  - 将错误信息传递给用户
  - 在 segment 中记录错误状态
  - 支持失败重试

  8. 缺少网络错误处理

  const response = await unifiedChatRequest(...)
  // 如果网络失败会怎样？

  建议：
  - 添加重试机制
  - 提供用户友好的错误提示
  - 支持从断点续传

  四、类型安全

  9. 使用 any 类型

  let results: any
  toolCallResults: any[]

  建议：定义严格的类型
  interface ToolCallResult {
    name: string
    content: unknown
    cost: number
    error?: Error
  }

  五、功能增强

  10. 缺少超时控制

  await this.runSingleRequest()  // 可能长时间挂起

  建议：
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 30000)
  )
  await Promise.race([unifiedChatRequest(...), timeoutPromise])

  11. Think 标签解析脆弱

  if (context.streaming.gatherContent.includes('

  建议：
  - 使用流式解析器（如自定义状态机）
  - 处理标签跨 chunk 的情况
  - 支持转义字符

  12. 缺少资源清理

  // completed 状态后，gatherContent 和 gatherReasoning 仍然占用内存

  建议：在 completed 状态清理临时数据

  13. Abort 错误处理不一致

  if (this.context.control.signal.aborted) {
    throw new AbortError()
  }

  但有些地方检查了 signal.aborted 后抛错，有些地方没有统一处理。

  建议：统一 AbortError 的处理策略

  六、状态机设计

  14. 状态转换缺少验证

  private transition(phase: StreamingPhase) {
    if (this.phase === phase) return  // 只检查重复
    // 没有检查状态转换是否合法
  }

  建议：定义合法的状态转换图
  private readonly validTransitions = {
    idle: ['receiving'],
    receiving: ['toolCall', 'completed'],
    toolCall: ['receiving', 'completed'],
    completed: []  // 终态
  }

  15. 缺少状态持久化

  如果应用崩溃或页面刷新，无法恢复进行中的对话。

  建议：考虑将关键状态持久化到 localStorage

  七、可观测性

  16. 缺少日志和监控

  当前只有一个 console.error，难以调试问题。

  建议：
  - 添加结构化日志
  - 记录关键性能指标（首字时间、总耗时等）
  - 支持不同日志级别

  优先级建议

  高优先级（影响稳定性和用户体验）：
  1. ✅ 错误处理改进（7, 8）
  2. ✅ 性能优化（1, 2）
  3. ✅ 代码重构消除重复（4, 5）

  中优先级（提升代码质量）：
  4. ✅ 类型安全（9）
  5. ✅ 超时控制（10）
  6. ✅ 状态转换验证（14）

  低优先级（锦上添花）：
  7. ✅ 状态持久化（15）
  8. ✅ 可观测性增强（16）

  需要我详细实现其中某个优化点吗？

> 可以从另外的角度出发：1、基于当前的方案分析；2、如果你认为有更好的方案代替

⏺ 好的，我从更深层次的架构角度来分析。

  一、基于当前方案的深度分析

  1.1 当前方案的架构本质

  核心模式：命令式状态机 + 推模型

  ┌─────────────────────────────────────────────────────┐
  │           当前的 StreamingSessionMachine             │
  ├─────────────────────────────────────────────────────┤
  │                                                      │
  │  ┌──────────────┐      ┌──────────────┐            │
  │  │ 状态机逻辑    │ ◀──▶ │ 数据累积      │            │
  │  │ (while loop) │      │ (gather*)    │            │
  │  └──────────────┘      └──────────────┘            │
  │         │                      │                    │
  │         └──────────┬───────────┘                    │
  │                    ▼                                │
  │         ┌──────────────────────┐                    │
  │         │ 副作用执行            │                    │
  │         │ - setMessages()      │                    │
  │         │ - invokeMcpToolCall()│                    │
  │         └──────────────────────┘                    │
  │                                                      │
  └─────────────────────────────────────────────────────┘

  1.2 优势分析（为什么选择这种方案）

  | 优势           | 说明                                                          |
  |----------------|---------------------------------------------------------------|
  | 线性思维模型   | while(true) 循环符合对话的线性直觉：请求 → 响应 → 工具 → 请求 |
  | 集中式状态管理 | 所有状态在 context 中，易于调试和理解                         |
  | 简单的事件循环 | 不需要复杂的事件驱动架构                                      |
  | 低实现成本     | 从 v1 迁移过来，改动风险小                                    |

  这种方案适用的场景：
  - 单一 LLM 后端
  - 简单的工具调用流程
  - 团队规模小，不需要复杂的协作

  1.3 深层问题分析

  问题1: 状态机维度单一

  type StreamingPhase = 'idle' | 'receiving' | 'toolCall' | 'completed'

  问题：一个维度无法表达复杂状态

  实际需要表达的状态：
  // 当前的 'receiving' 实际上包含了多种子状态：
  'receiving' + {
    parsingThinkTag: boolean,
    accumulatingToolCall: boolean,
    bufferingContent: boolean
  }

  后果：需要在 handleStreamingChunk 中用多个 if 分支处理，逻辑分散。

  问题2: 工具调用与流式响应耦合

  async start(): Promise<StreamingContext> {
    while (true) {
      await this.runSingleRequest()  // 流式请求
      if (hasToolCall) {
        await this.handleToolCalls()  // 工具执行
      } else {
        break
      }
    }
  }

  问题：
  - 工具调用是对话层的概念，流式是传输层的概念
  - 当前方案把两者混在一起
  - 如果要支持：
    - 并行工具调用
    - 工具调用超时/重试
    - 工具调用嵌套

  需要修改核心循环

  问题3: 数据所有权不清

  // 三份数据代表同一件事，但需要手动同步
  context.session.messageEntities  // UI 层
  context.session.chatMessages     // API 层
  context.request.messages         // 请求历史

  手动同步代码遍布各处：
  this.context.session.messageEntities = updatedMessages
  this.context.session.chatMessages = updatedMessages.map(msg => msg.body)
  this.context.request.messages.push(toolFunctionMessage)

  容易出错的场景：
  - 忘记同步某个数据源
  - 同步顺序错误导致数据不一致

  问题4: 缺乏可组合性

  handleStreamingChunk(context, resp, setMessages) {
    // 140行：处理 think tag + tool call + segments
  }

  问题：所有处理逻辑耦合在一起，无法：
  - 单独测试 think tag 解析
  - 替换 segment 处理策略
  - 插入自定义的 chunk 处理器

  问题5: 错误恢复困难

  while (toolRuntime.toolCalls.length > 0) {
    const toolCall = toolRuntime.toolCalls.shift()  // 已经从数组移除
    try {
      await executeToolCall(toolCall)
    } catch (error) {
      console.error(error)  // 只是记录，toolCall 已经丢失
    }
  }

  问题：如果工具调用失败，无法：
  - 重试该工具调用
  - 跳过该工具继续执行
  - 回滚到执行前的状态

  ---
  二、更好的替代方案

  方案 A: 分层架构 + 责任链模式

  核心思想

  将流式传输、消息解析、工具执行、状态管理分离成独立层。

  架构图

  ┌─────────────────────────────────────────────────────────────┐
  │                      应用层                   │
  │  - 用户触发对话                                               │
  │  - UI 状态更新                                               │
  └──────────────────────────┬──────────────────────────────────┘
                             │
  ┌──────────────────────────▼──────────────────────────────────┐
  │                   对话编排层                │
  │  - 管理对话轮次                                              │
  │  - 协调消息解析、工具调用、流式输出                           │
  │  - 独立于传输方式（流式/非流式）                              │
  └──────────────────────────┬──────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
  ┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼────────┐
  │  消息解析层      │ │ 工具执行层   │ │  状态管理层    │
  │  - Think tag    │ │ - 并行执行   │ │  - Redux/Zustand│
  │  - Segment      │ │ - 重试/超时  │ │  - 时间旅行调试 │
  │  - Tool call    │ │ - 结果聚合   │ │                │
  └────────┬────────┘ └──────┬──────┘ └───────┬────────┘
           │                 │                 │
  ┌────────▼─────────────────▼─────────────────▼─────────────┐
  │                   传输抽象层                │
  │  - 统一的流式接口                                          │
  │  - 支持 SSE / WebSocket / Stream API                       │
  │  - 可插拔的后端适配器                                       │
  └─────────────────────────────────────────────────────────────┘

  核心代码结构

  // ============ 1. 传输层 ============

  interface StreamTransport {
    request(req: ChatRequest): AsyncIterable<StreamChunk>
    abort(): void
  }

  class UnifiedChatTransport implements StreamTransport {
    async *request(req: ChatRequest): AsyncIterable<StreamChunk> {
      for await (const chunk of unifiedChatRequest(req)) {
        yield chunk
      }
    }
  }

  // ============ 2. 消息解析层 ============

  interface ChunkProcessor {
    canProcess(chunk: StreamChunk): boolean
    process(context: ParseContext, chunk: StreamChunk): ProcessResult
  }

  class ThinkTagProcessor implements ChunkProcessor {
    canProcess(chunk: StreamChunk): boolean {
      return chunk.content?.includes('

    process(ctx: ParseContext, chunk: StreamChunk): ProcessResult {
      // 专注于 think tag 解析逻辑
    }
  }

  class ToolCallProcessor implements ChunkProcessor {
    canProcess(chunk: StreamChunk): boolean {
      return chunk.toolCalls?.length > 0
    }
    // ...
  }

  class ParserPipeline {
    private processors: ChunkProcessor[] = []

    add(processor: ChunkProcessor) { this.processors.push(processor) }

    parse(chunk: StreamChunk): ParseResult {
      for (const processor of this.processors) {
        if (processor.canProcess(chunk)) {
          return processor.process(this.context, chunk)
        }
      }
    }
  }

  // ============ 3. 工具执行层 ============

  interface ToolExecutor {
    execute(toolCall: ToolCall): Promise<ToolResult>
  }

  class ParallelToolExecutor implements ToolExecutor {
    async execute(calls: ToolCall[]): Promise<ToolResult[]> {
      return Promise.allSettled(
        calls.map(call => this.executeOne(call))
      )
    }

    private async executeOne(call: ToolCall): Promise<ToolResult> {
      // 带重试、超时的执行逻辑
    }
  }

  // ============ 4. 对话编排层 ============

  class ConversationOrchestrator {
    constructor(
      private transport: StreamTransport,
      private parser: ParserPipeline,
      private toolExecutor: ToolExecutor,
      private store: ChatStore
    ) {}

    async start(initialRequest: ChatRequest): Promise<void> {
      let currentRequest = initialRequest

      while (true) {
        // 1. 发起请求
        const stream = this.transport.request(currentRequest)

        // 2. 解析流式响应
        const parsed = await this.parseStream(stream)

        // 3. 检查是否需要工具调用
        if (!parsed.hasToolCalls) break

        // 4. 执行工具（可并行、可重试）
        const toolResults = await this.toolExecutor.execute(parsed.toolCalls)

        // 5. 构建下一次请求
        currentRequest = this.buildNextRequest(parsed, toolResults)
      }
    }
  }

  优势对比

  | 维度         | 当前方案               | 分层方案             |
  |--------------|------------------------|----------------------|
  | 可测试性     | 需要 mock 整个 Machine | 每层可独立测试       |
  | 可扩展性     | 修改核心循环           | 插件式添加处理器     |
  | 并行工具调用 | 需要改循环逻辑         | 替换 Executor 即可   |
  | 错误恢复     | 困难（状态已变）       | 每层独立处理错误     |
  | 调试难度     | 状态分散               | 每层有清晰的输入输出 |
  | 学习曲线     | 低（线性代码）         | 中（需要理解分层）   |

  ---
  方案 B: Actor 模型

  核心思想

  将每个职责封装成独立的 Actor，通过消息传递协作。

  架构图

  ┌─────────────────────────────────────────────────────────────┐
  │                        Actor 系统                           │
  ├─────────────────────────────────────────────────────────────┤
  │                                                              │
  │   ┌─────────┐     ┌─────────┐     ┌─────────┐              │
  │   │ Stream  │     │ Parser  │     │  Tool   │              │
  │   │ Actor   │────▶│ Actor   │────▶│  Actor  │              │
  │   └─────────┘     └─────────┘     └─────────┘              │
  │        │               │               │                    │
  │        │               │               │                    │
  │        ▼               ▼               ▼                    │
  │  ┌─────────┐     ┌─────────┐     ┌─────────┐              │
  │  │ State   │     │ Segment │     │ Monitor │              │
  │  │ Manager │     │ Builder │     │ Actor   │              │
  │  └─────────┘     └─────────┘     └─────────┘              │
  │                                                              │
  │  消息流:                                                     │
  │  StreamActor ──[Chunk]──▶ ParserActor                        │
  │  ParserActor ──[ParsedData]──▶ SegmentBuilder               │
  │  ToolActor ──[ToolResult]──▶ StateManager                   │
  └─────────────────────────────────────────────────────────────┘

  核心代码

  // Actor 消息类型
  type ActorMessage =
    | { type: 'STREAM_CHUNK', payload: StreamChunk }
    | { type: 'TOOL_CALL', payload: ToolCall[] }
    | { type: 'PARSE_RESULT', payload: ParseResult }
    | { type: 'UPDATE_STATE', payload: Partial<State> }

  // Base Actor
  abstract class Actor {
    protected mailbox: ActorMessage[] = []

    abstract receive(message: ActorMessage): void

    send(to: Actor, message: ActorMessage) {
      to.receive(message)
    }
  }

  // Stream Actor: 专门处理流式数据
  class StreamActor extends Actor {
    receive(message: ActorMessage) {
      if (message.type === 'STREAM_CHUNK') {
        // 处理流式 chunk
        this.send(parserActor, {
          type: 'PARSE_RESULT',
          payload: this.parse(message.payload)
        })
      }
    }
  }

  // Tool Actor: 专门处理工具调用
  class ToolActor extends Actor {
    private queue: ToolCall[] = []

    receive(message: ActorMessage) {
      if (message.type === 'TOOL_CALL') {
        this.queue.push(...message.payload)
        this.processQueue()
      }
    }

    private async processQueue() {
      const results = await Promise.all(
        this.queue.map(call => this.executeWithRetry(call))
      )

      this.send(stateManager, {
        type: 'UPDATE_STATE',
        payload: { toolResults: results }
      })
    }
  }

  // 使用
  const streamActor = new StreamActor()
  const parserActor = new ParserActor()
  const toolActor = new ToolActor()
  const stateManager = new StateManager()

  // 建立连接
  streamActor.connect(parserActor)
  parserActor.connect(toolActor)
  toolActor.connect(stateManager)

  优势

  | 特性     | 说明                          |
  |----------|-------------------------------|
  | 天然并发 | 每个 Actor 独立运行           |
  | 隔离性好 | Actor 之间不共享状态          |
  | 容错性强 | 一个 Actor 崩溃不影响其他     |
  | 易于监控 | 可以监控每个 Actor 的消息流量 |

  劣势

  | 劣势     | 说明                       |
  |----------|----------------------------|
  | 复杂度高 | 需要理解 Actor 模型        |
  | 调试困难 | 异步消息传递难以追踪       |
  | 过重设计 | 对于简单的聊天场景可能过度 |

  ---
  方案 C: 函数式 + 不可变数据流

  核心思想

  将整个流程看作数据转换管道。

  架构图

                      数据流
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
      ▼                  ▼                  ▼
  ┌─────────┐       ┌─────────┐       ┌─────────┐
  │ 初始    │       │ 解析    │       │ 执行    │
  │ Request │──────▶│ Chunks  │──────▶│ Tools   │
  └─────────┘       └─────────┘       └─────────┘
                                              │
      ┌──────────────────────────────────────┘
      │
      ▼
  ┌─────────┐       ┌─────────┐       ┌─────────┐
  │ 构建    │       │ 输出    │       │ 最终    │
  │ 新Request│──────▶│ Segments│──────▶│ State   │
  └─────────┘       └─────────┘       └─────────┘

  每一步都是纯函数转换，不可变数据

  核心代码

  // 定义不可变状态
  interface ChatState {
    readonly request: ChatRequest
    readonly messages: MessageEntity[]
    readonly segments: Segment[]
    readonly toolCalls: ToolCall[]
    readonly phase: 'idle' | 'streaming' | 'tool_executing' | 'done'
  }

  // 纯函数转换
  type StateTransition = (state: ChatState) => ChatState

  // 流式响应处理
  const processStreamChunk = (chunk: StreamChunk): StateTransition =>
    (state) => ({
      ...state,
      segments: updateSegments(state.segments, chunk),
      toolCalls: chunk.toolCalls
        ? [...state.toolCalls, ...chunk.toolCalls]
        : state.toolCalls
    })

  // 工具调用执行
  const executeTools = async (state: ChatState): Promise<ChatState> => {
    const results = await Promise.all(
      state.toolCalls.map(call => executeTool(call))
    )

    return {
      ...state,
      request: buildNextRequest(state.request, results),
      toolCalls: [],
      phase: 'idle'
    }
  }

  // 主循环：函数式风格
  async function* chatLoop(
    initialState: ChatState
  ): AsyncGenerator<ChatState> {
    let state = initialState

    while (state.phase !== 'done') {
      // 1. 发起请求
      const stream = await sendRequest(state.request)

      // 2. 处理流式响应
      for await (const chunk of stream) {
        state = processStreamChunk(chunk)(state)
        yield state
      }

      // 3. 执行工具
      if (state.toolCalls.length > 0) {
        state = await executeTools(state)
        yield state
      } else {
        state = { ...state, phase: 'done' }
      }
    }
  }

  // 使用
  for await (const state of chatLoop(initialState)) {
    updateUI(state)
  }

  优势

  | 优势     | 说明                               |
  |----------|------------------------------------|
  | 可预测性 | 纯函数，相同输入必有相同输出       |
  | 易于测试 | 每个转换函数可独立测试             |
  | 时间旅行 | 可以记录所有 state，支持 undo/redo |
  | 无副作用 | 副作用（如 UI 更新）在循环外处理   |

  劣势

  | 劣势       | 说明               |
  |------------|--------------------|
  | 不可变开销 | 频繁创建对象       |
  | 学习曲线   | 需要函数式编程思维 |
  | 调试困难   | 堆栈可能不直观     |

  ---
  三、方案对比总结

  方案选择矩阵

  | 维度         | 当前方案   | 分层架构   | Actor 模型 | 函数式流   |
  |--------------|------------|------------|------------|------------|
  | 复杂度       | ⭐ 低      | ⭐⭐ 中    | ⭐⭐⭐ 高  | ⭐⭐ 中    |
  | 可维护性     | ⭐⭐       | ⭐⭐⭐⭐   | ⭐⭐⭐     | ⭐⭐⭐⭐   |
  | 可扩展性     | ⭐⭐       | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐   |
  | 可测试性     | ⭐⭐       | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐ |
  | 性能         | ⭐⭐⭐     | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
  | 学习曲线     | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     | ⭐⭐       | ⭐⭐⭐     |
  | 适合团队规模 | 小型       | 中大型     | 大型       | 中型       |

  推荐策略

  如果是当前项目

  建议：渐进式重构到分层架构

  1. 第一步：抽取 Parser（消息解析层）
  // 不改动整体架构，先解决最复杂的问题
  class ChunkParser {
    parse(chunk: StreamChunk): ParseResult { ... }
  }

  2. 第二步：抽取 ToolExecutor（工具执行层）
  // 解决串行执行和错误处理问题
  class ToolExecutor {
    async execute(calls: ToolCall[]): Promise<ToolResult[]> { ... }
  }

  3. 第三步：统一状态管理
  // 解决数据同步问题
  class ChatStateManager {
    updateMessages(updater: (msgs: MessageEntity[]) => MessageEntity[]) { ... }
  }

  4. 第四步：重构成 Orchestrator（可选）
  // 如果需要支持更多功能，再考虑完全重构

  如果是新项目

  建议：根据需求选择

  - 简单聊天应用：当前方案即可
  - 需要复杂工具编排：分层架构
  - 需要高并发/分布式：Actor 模型
  - 需要时间旅行/协作：函数式流

  ---
  四、具体改进建议

  基于当前项目状态，我建议先做小重构，为未来铺路：

  // 改进后的代码结构（向后兼容）

  // 1. 抽取 Parser
  interface ChunkParser {
    parse(chunk: StreamChunk, state: StreamingState): ParsedChunk
  }

  class DefaultChunkParser implements ChunkParser {
    parse(chunk: StreamChunk, state: StreamingState): ParsedChunk {
      // 将 handleStreamingChunk 的逻辑移到这里
      // 返回结构化的数据
    }
  }

  // 2. 抽取 ToolExecutor
  interface ToolExecutor {
    execute(calls: ToolCall[]): Promise<ToolResult[]>
  }

  class DefaultToolExecutor implements ToolExecutor {
    async execute(calls: ToolCall[]): Promise<ToolResult[]> {
      // 支持 Promise.all 并行执行
    }
  }

  // 3. StreamingSessionMachine 保持不变，内部使用新接口
  class StreamingSessionMachine {
    private parser = new DefaultChunkParser()
    private toolExecutor = new DefaultToolExecutor()

    private async handleStreamingChunk(chunk: StreamChunk) {
      const parsed = this.parser.parse(chunk, this.context.streaming)
      // 更新逻辑
    }

    private async handleToolCalls() {
      const results = await this.toolExecutor.execute(
        this.context.streaming.tools.toolCalls
      )
      // 处理结果
    }
  }

  这样的好处：
  1. ✅ 不破坏现有功能
  2. ✅ 提高了可测试性
  3. ✅ 为未来重构留有余地
  4. ✅ 可以逐步替换实现