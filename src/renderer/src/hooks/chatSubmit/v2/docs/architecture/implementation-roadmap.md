# 实施路线图

## 一、总体计划

**目标**：将 `useChatSubmit` Hook 从 400+ 行复杂逻辑重构为清晰的分层架构

**总时间**：3-4 周

**阶段划分**：
- 第一阶段：基础设施层（1 周）
- 第二阶段：领域服务层（1 周）
- 第三阶段：Hook 薄化（1 周）
- 第四阶段：优化与清理（3-5 天）

---

## 二、第一阶段：基础设施层（第 1 周）

### 目标

建立依赖注入容器、事件总线、仓储层等基础设施

### 任务清单

#### 2.1.1 创建目录结构（0.5 天）

```bash
# 创建基础设施层目录
mkdir -p src/renderer/src/infrastructure/repositories
mkdir -p src/renderer/src/infrastructure/network
mkdir -p src/renderer/src/infrastructure/factories

# 创建领域层目录
mkdir -p src/renderer/src/domain/chat
mkdir -p src/renderer/src/shared

# 创建测试目录
mkdir -p src/renderer/src/domain/chat/__tests__
mkdir -p src/renderer/src/infrastructure/__tests__
```

#### 2.1.2 实现依赖注入容器（1 天）

**文件**：`src/renderer/src/shared/ServiceContainer.ts`

```typescript
export class ServiceContainer {
  private static instance: ServiceContainer
  private services: Map<string, any> = new Map()

  static getInstance(): ServiceContainer { /* ... */ }

  register<T>(key: string, factory: () => T): void { /* ... */ }

  get<T>(key: string): T { /* ... */ }

  clear(): void { /* ... */ }
}
```

**测试**：`src/renderer/src/shared/__tests__/ServiceContainer.test.ts`

**验收标准**：
- [ ] 单例模式正常工作
- [ ] 可以注册和获取服务
- [ ] 服务可以正确依赖注入
- [ ] 测试覆盖率 > 90%

---

#### 2.1.3 实现事件总线（1 天）

**文件**：
- `src/renderer/src/shared/EventBus.ts`
- `src/renderer/src/shared/chatEvents.ts`
- `src/renderer/src/shared/useEventBus.ts`

```typescript
export class EventBus<T> {
  on<K>(event: K, listener: Listener): () => void
  emit<K>(event: K, data: T[K]): void
  clear(): void
}

export interface ChatEvents {
  'message.created': MessageEntity
  'message.updated': { id: number; updates: Partial<MessageEntity> }
  'streaming.chunk': StreamingChunk
  'streaming.completed': ChatResult
  'tool.started': ToolStart
  'tool.completed': ToolResult
}
```

**测试**：`src/renderer/src/shared/__tests__/EventBus.test.ts`

**验收标准**：
- [ ] 可以订阅和发射事件
- [ ] 取消订阅正常工作
- [ ] 支持泛型类型
- [ ] Hook 可以监听事件
- [ ] 测试覆盖率 > 90%

---

#### 2.1.4 实现仓储层（1.5 天）

**文件**：
- `src/renderer/src/infrastructure/repositories/MessageRepository.ts`
- `src/renderer/src/infrastructure/repositories/ChatRepository.ts`
- `src/renderer/src/infrastructure/repositories/WorkspaceRepository.ts`

```typescript
export class MessageRepository {
  async save(message: MessageEntity): Promise<number>
  async saveBatch(messages: MessageEntity[]): Promise<number[]>
  async update(id: number, updates: Partial<MessageEntity>): Promise<void>
  async findById(id: number): Promise<MessageEntity | null>
}

export class ChatRepository {
  async save(chat: ChatEntity): Promise<number>
  async update(id: number, updates: Partial<ChatEntity>): Promise<void>
  async findById(id: number): Promise<ChatEntity | null>
}
```

**测试**：
- `src/renderer/src/infrastructure/repositories/__tests__/MessageRepository.test.ts`
- `src/renderer/src/infrastructure/repositories/__tests__/ChatRepository.test.ts`

**验收标准**：
- [ ] 封装了现有的数据库操作
- [ ] 可以独立测试（使用 mock 数据库）
- [ ] 测试覆盖率 > 80%

---

#### 2.1.5 实现网络客户端（1 天）

**文件**：`src/renderer/src/infrastructure/network/NetworkClient.ts`

```typescript
export interface INetworkClient {
  streamChat(
    request: IUnifiedRequest,
    signal: AbortSignal
  ): AsyncIterable<IUnifiedResponse>
}

export class RendererNetworkClient implements INetworkClient {
  async *streamChat(request, signal) {
    yield* unifiedChatRequest(request, signal, () => {}, () => {})
  }
}

// 可选：Main 进程实现
export class MainNetworkClient implements INetworkClient {
  constructor(private readonly ipc: IPC) {}

  async *streamChat(request, signal) {
    yield* this.ipc.stream('chat:request', { request, signal })
  }
}
```

**测试**：`src/renderer/src/infrastructure/network/__tests__/NetworkClient.test.ts`

**验收标准**：
- [ ] 封装了 `unifiedChatRequest`
- [ ] 支持流式响应
- [ ] 支持取消请求
- [ ] 测试覆盖率 > 80%

---

#### 2.1.6 实现 Factory 层（0.5 天）

**文件**：
- `src/renderer/src/infrastructure/factories/MessageFactory.ts`
- `src/renderer/src/infrastructure/factories/RequestFactory.ts`

```typescript
export class MessageFactory {
  createUserMessage(
    text: string,
    media: ClipbordImg[] | string[],
    model: IModel,
    chatId: number,
    chatUuid: string
  ): MessageEntity

  createAssistantPlaceholder(model: IModel): MessageEntity

  createToolResultMessage(...): MessageEntity
}

export class RequestFactory {
  createChatRequest(
    messages: ChatMessage[],
    model: IModel,
    provider: IProvider,
    systemPrompts: string[]
  ): IUnifiedRequest
}
```

**验收标准**：
- [ ] 封装了对象创建逻辑
- [ ] 易于测试
- [ ] 类型安全

---

### 第一阶段总结

**交付物**：
- ✅ 依赖注入容器
- ✅ 事件总线
- ✅ 仓储层
- ✅ 网络客户端
- ✅ Factory 层
- ✅ 单元测试

**时间投入**：5-6 天

**风险**：低（不影响现有代码）

---

## 三、第二阶段：领域服务层（第 2 周）

### 目标

实现核心业务逻辑服务

### 任务清单

#### 3.2.1 实现 MessageService（1 天）

**文件**：`src/renderer/src/domain/chat/MessageService.ts`

```typescript
export class MessageService {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly messageFactory: MessageFactory,
    private readonly eventBus: EventBus<ChatEvents>
  ) {}

  async createUserMessage(
    input: ChatInput,
    chatId: number,
    chatUuid: string,
    model: IModel
  ): Promise<MessageEntity> {
    const message = this.messageFactory.createUserMessage(...)
    const id = await this.messageRepository.save(message)
    message.id = id

    // 发射事件
    this.eventBus.emit('message.created', message)

    return message
  }

  createAssistantPlaceholder(model: IModel): MessageEntity {
    const message = this.messageFactory.createAssistantPlaceholder(model)
    this.eventBus.emit('message.created', message)
    return message
  }

  updateMessage(
    id: number,
    updates: Partial<MessageEntity>
  ): void {
    this.eventBus.emit('message.updated', { id, updates })
  }

  async saveMessages(messages: MessageEntity[]): Promise<void> {
    await this.messageRepository.saveBatch(messages)
  }
}
```

**测试**：`src/renderer/src/domain/chat/__tests__/MessageService.test.ts`

**验收标准**：
- [ ] 可以创建用户消息
- [ ] 可以创建助手占位符
- [ ] 可以更新消息（通过事件）
- [ ] 可以批量保存消息
- [ ] 测试覆盖率 > 80%

---

#### 3.2.2 实现 ChatService（1 天）

**文件**：`src/renderer/src/domain/chat/ChatService.ts`

```typescript
export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly messageService: MessageService
  ) {}

  async getOrCreateSession(
    model: IModel,
    providers: IProvider[]
  ): Promise<ChatSession> {
    // 检查是否有现有会话
    // 如果没有，创建新会话
    // 创建工作空间
    // 返回会话信息
  }

  async updateChat(
    chatId: number,
    updates: Partial<ChatEntity>
  ): Promise<void> {
    await this.chatRepository.update(chatId, updates)
  }

  async generateTitle(
    chatId: number,
    content: string,
    model: IModel,
    providers: IProvider[]
  ): Promise<string> {
    // 调用标题生成逻辑
  }
}
```

**测试**：`src/renderer/src/domain/chat/__tests__/ChatService.test.ts`

**验收标准**：
- [ ] 可以获取现有会话
- [ ] 可以创建新会话
- [ ] 可以更新会话
- [ ] 可以生成标题
- [ ] 测试覆盖率 > 80%

---

#### 3.2.3 实现 RequestBuilder（0.5 天）

**文件**：`src/renderer/src/domain/chat/RequestBuilder.ts`

```typescript
export class RequestBuilder {
  build(
    session: ChatSession,
    input: ChatInput
  ): IUnifiedRequest {
    const filteredMessages = this.filterMessages(session.messages)
    const tools = this.prepareTools(input.tools)

    return {
      baseUrl: session.provider.apiUrl,
      messages: filteredMessages,
      apiKey: session.provider.apiKey,
      prompt: session.systemPrompts.join('\n'),
      model: session.model.value,
      modelType: session.model.type,
      tools: tools,
      stream: true
    }
  }

  private filterMessages(messages: ChatMessage[]): ChatMessage[] {
    // 过滤空消息
  }

  private prepareTools(customTools?: any[]): ITool[] {
    // 准备工具列表（嵌入式工具 + 自定义工具）
  }
}
```

**测试**：`src/renderer/src/domain/chat/__tests__/RequestBuilder.test.ts`

**验收标准**：
- [ ] 可以构建请求对象
- [ ] 可以过滤空消息
- [ ] 可以准备工具列表
- [ ] 测试覆盖率 > 90%

---

#### 3.2.4 实现 ToolService（0.5 天）

**文件**：`src/renderer/src/domain/chat/ToolService.ts`

```typescript
export class ToolService {
  constructor(
    private readonly toolExecutor: ToolExecutor,
    private readonly toolRegistry: ToolRegistry,
    private readonly eventBus: EventBus<ChatEvents>
  ) {}

  async executeToolCalls(
    toolCalls: ToolCallProps[],
    signal: AbortSignal
  ): Promise<ToolExecutionResult[]> {
    const results = await this.toolExecutor.execute(toolCalls, { signal })

    // 发射事件
    for (const result of results) {
      if (result.status === 'success') {
        this.eventBus.emit('tool.completed', {
          name: result.name,
          result: result.content
        })
      }
    }

    return results
  }

  formatToolResult(name: string, result: any): string {
    const formatter = this.toolRegistry.getFormatter(name)
    return formatter.format(result)
  }
}
```

**测试**：`src/renderer/src/domain/chat/__tests__/ToolService.test.ts`

**验收标准**：
- [ ] 可以执行工具调用
- [ ] 可以格式化工具结果
- [ ] 可以发射工具事件
- [ ] 测试覆盖率 > 80%

---

#### 3.2.5 实现 StreamingOrchestrator（1.5 天）

**文件**：`src/renderer/src/domain/chat/StreamingOrchestrator.ts`

```typescript
export class StreamingOrchestrator {
  constructor(
    private readonly networkClient: INetworkClient,
    private readonly chunkParser: ChunkParser,
    private readonly messageService: MessageService,
    private readonly toolService: ToolService,
    private readonly eventBus: EventBus<ChatEvents>
  ) {}

  async execute(request: IUnifiedRequest): Promise<StreamingResult> {
    while (true) {
      // 1. 发送请求
      const response = this.networkClient.streamChat(request, signal)

      // 2. 处理流式响应
      for await (const chunk of response) {
        const parsed = this.chunkParser.parse(chunk)

        // 发射事件
        this.eventBus.emit('streaming.chunk', {
          type: parsed.contentDelta ? 'text' : 'reasoning',
          content: parsed.contentDelta || parsed.reasoningDelta
        })

        // 更新消息
        this.messageService.updateMessage(lastMessageId, {
          content: parsed.contentDelta
        })
      }

      // 3. 检查是否有工具调用
      if (hasToolCalls) {
        await this.toolService.executeToolCalls(toolCalls, signal)
        // 继续下一轮
      } else {
        break
      }
    }

    return result
  }
}
```

**测试**：`src/renderer/src/domain/chat/__tests__/StreamingOrchestrator.test.ts`

**验收标准**：
- [ ] 可以处理流式响应
- [ ] 可以处理工具调用
- [ ] 可以循环多轮对话
- [ ] 可以发射事件
- [ ] 测试覆盖率 > 80%

---

#### 3.2.6 实现 ChatSubmissionService（1 天）

**文件**：`src/renderer/src/domain/chat/ChatSubmissionService.ts`

```typescript
export class ChatSubmissionService {
  constructor(
    private readonly messageService: MessageService,
    private readonly chatService: ChatService,
    private readonly requestBuilder: RequestBuilder,
    private readonly streamingOrchestrator: StreamingOrchestrator,
    private readonly titleGenerator: TitleGenerator
  ) {}

  async submit(
    input: ChatInput,
    model: IModel,
    providers: IProvider[]
  ): Promise<ChatResult> {
    // 1. 准备会话
    const session = await this.chatService.getOrCreateSession(model, providers)

    // 2. 创建用户消息
    await this.messageService.createUserMessage(
      input,
      session.chatId,
      session.chatUuid,
      model
    )

    // 3. 创建助手占位符
    const assistantMessage = this.messageService.createAssistantPlaceholder(model)

    // 4. 构建请求
    const request = this.requestBuilder.build(session, input)

    // 5. 流式处理
    const streamingResult = await this.streamingOrchestrator.execute(request)

    // 6. 持久化结果
    await this.messageService.saveMessages(streamingResult.messages)
    await this.chatService.updateChat(session.chatId, {
      messages: streamingResult.messageIds
    })

    // 7. 生成标题（如果需要）
    let title
    if (this.shouldGenerateTitle(session.chatEntity)) {
      title = await this.titleGenerator.generate(
        input.textCtx,
        model,
        providers
      )
    }

    return {
      messages: streamingResult.messages,
      chatEntity: { ...session.chatEntity, title },
      title
    }
  }

  private shouldGenerateTitle(chat: ChatEntity): boolean {
    return !chat.title || chat.title === 'NewChat'
  }
}
```

**测试**：`src/renderer/src/domain/chat/__tests__/ChatSubmissionService.test.ts`

**验收标准**：
- [ ] 可以完成完整的提交流程
- [ ] 可以处理多轮对话
- [ ] 可以生成标题
- [ ] 错误处理完善
- [ ] 测试覆盖率 > 80%

---

### 第二阶段总结

**交付物**：
- ✅ MessageService
- ✅ ChatService
- ✅ RequestBuilder
- ✅ ToolService
- ✅ StreamingOrchestrator
- ✅ ChatSubmissionService
- ✅ 单元测试

**时间投入**：5-6 天

**风险**：中（开始影响现有代码，需要谨慎）

---

## 四、第三阶段：Hook 薄化（第 3 周）

### 目标

重构 `useChatSubmit` Hook，只保留 UI 状态管理

### 任务清单

#### 4.3.1 创建新的 Hook（1 天）

**文件**：`src/renderer/src/hooks/useChatSubmitNew.tsx`

```typescript
function useChatSubmitNew() {
  // UI 状态
  const { selectedModel, setMessages, setFetchState } = useChatStore()
  const { providers } = useAppConfigStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 服务层
  const chatService = useService<ChatSubmissionService>('chatSubmissionService')
  const eventBus = useEventBus<ChatEvents>()

  // 监听事件
  useEvent(eventBus, 'message.created', (message) => {
    setMessages(prev => [...prev, message])
  })

  useEvent(eventBus, 'message.updated', ({ id, updates }) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ))
  })

  useEvent(eventBus, 'streaming.chunk', (chunk) => {
    // 更新最后一条消息
  })

  // 提交函数
  const onSubmit = async (textCtx, mediaCtx, options) => {
    if (isSubmitting) return
    if (!selectedModel) throw new Error('No model selected')

    setIsSubmitting(true)
    setFetchState(true)

    try {
      const result = await chatService.submit(
        { textCtx, mediaCtx, tools: options.tools, prompt: options.prompt },
        selectedModel,
        providers
      )

      setMessages(result.messages)
      return result
    } finally {
      setIsSubmitting(false)
      setFetchState(false)
    }
  }

  return { onSubmit, isSubmitting }
}
```

**验收标准**：
- [ ] Hook 代码行数 < 100 行
- [ ] 只包含 UI 状态管理
- [ ] API 与旧 Hook 兼容

---

#### 4.3.2 初始化服务容器（0.5 天）

**文件**：`src/renderer/src/shared/initializeServices.ts`

```typescript
export function initializeServices() {
  const container = ServiceContainer.getInstance()

  // 基础设施层
  container.register('messageRepository', () => new MessageRepository())
  container.register('chatRepository', () => new ChatRepository())
  container.register('networkClient', () => new RendererNetworkClient())

  // 领域服务层
  container.register('messageService', () => new MessageService(
    container.get('messageRepository'),
    new MessageFactory(),
    container.get('eventBus')
  ))

  container.register('chatService', () => new ChatService(
    container.get('chatRepository'),
    new WorkspaceService(),
    container.get('messageService')
  ))

  container.register('toolService', () => new ToolService(
    new ToolExecutor({ maxConcurrency: 3 }),
    new ToolRegistry(),
    container.get('eventBus')
  ))

  container.register('requestBuilder', () => new RequestBuilder())

  container.register('streamingOrchestrator', () => new StreamingOrchestrator(
    container.get('networkClient'),
    new ChunkParser(),
    container.get('messageService'),
    container.get('toolService'),
    container.get('eventBus')
  ))

  container.register('chatSubmissionService', () => new ChatSubmissionService(
    container.get('messageService'),
    container.get('chatService'),
    container.get('requestBuilder'),
    container.get('streamingOrchestrator'),
    new TitleGenerator()
  ))
}
```

**验收标准**：
- [ ] 所有服务正确注册
- [ ] 依赖注入正常工作

---

#### 4.3.3 添加 Feature Flag（0.5 天）

**文件**：`src/renderer/src/hooks/useChatSubmit.tsx`

```typescript
// 旧实现
export { default as useChatSubmitLegacy } from './chatSubmit/v2'

// 新实现
export { default as useChatSubmitNew } from './useChatSubmitNew'

// Feature flag
const USE_NEW_CHAT_SUBMIT = process.env.USE_NEW_CHAT_SUBMIT === 'true'

export default USE_NEW_CHAT_SUBMIT ? useChatSubmitNew : useChatSubmitLegacy
```

**验收标准**：
- [ ] 可以通过环境变量切换
- [ ] 默认使用旧实现
- [ ] 两种实现都可以正常工作

---

#### 4.3.4 集成测试（1 天）

**文件**：`src/renderer/src/hooks/__tests__/useChatSubmitNew.integration.test.ts`

```typescript
describe('useChatSubmit Integration', () => {
  it('should complete full chat flow', async () => {
    // 1. 渲染 Hook
    const { result } = renderHook(() => useChatSubmitNew())

    // 2. 提交消息
    await act(async () => {
      await result.current.onSubmit('hello', [], { tools: [], prompt: '' })
    })

    // 3. 验证结果
    expect(result.current.isSubmitting).toBe(false)
    // ... 更多断言
  })
})
```

**验收标准**：
- [ ] 覆盖主要场景
- [ ] 测试通过率 100%

---

#### 4.3.5 并行运行与对比（1 天）

**目标**：新旧实现并行运行，对比结果

```typescript
function useChatSubmitComparison() {
  const legacySubmit = useChatSubmitLegacy()
  const newSubmit = useChatSubmitNew()

  const onSubmit = async (...args) => {
    // 并行调用两种实现
    const [legacyResult, newResult] = await Promise.allSettled([
      legacySubmit(...args),
      newSubmit(...args)
    ])

    // 对比结果
    if (JSON.stringify(legacyResult) !== JSON.stringify(newResult)) {
      console.warn('Results differ:', { legacyResult, newResult })
    }

    return newResult
  }

  return onSubmit
}
```

**验收标准**：
- [ ] 可以并行运行两种实现
- [ ] 结果一致（流式响应可能有小差异）
- [ ] 性能无明显下降

---

#### 4.3.6 逐步切换（1 天）

1. 开发环境启用新实现
2. 内部测试
3. 收集反馈
4. 修复问题

**验收标准**：
- [ ] 开发环境使用新实现
- [ ] 主要功能正常
- [ ] 无严重 bug

---

### 第三阶段总结

**交付物**：
- ✅ 新的 useChatSubmit Hook
- ✅ 服务容器初始化
- ✅ Feature flag
- ✅ 集成测试
- ✅ 并行运行对比

**时间投入**：5 天

**风险**：高（开始影响用户功能，需要充分测试）

---

## 五、第四阶段：优化与清理（3-5 天）

### 目标

移除旧代码，优化性能，完善文档

### 任务清单

#### 5.4.1 移除旧实现（1 天）

```bash
# 移除旧文件
rm -rf src/renderer/src/hooks/chatSubmit/v2
rm -rf src/renderer/src/hooks/chatSubmit/docs

# 更新导出
# src/renderer/src/hooks/useChatSubmit.tsx
export { default as useChatSubmit } from './useChatSubmitNew'
```

**验收标准**：
- [ ] 旧代码已移除
- [ ] 新代码作为默认实现
- [ ] 所有测试通过

---

#### 5.4.2 性能优化（1 天）

**优化项**：
1. 减少事件监听器数量
2. 优化消息更新频率（throttle）
3. 懒加载服务实例
4. 内存泄漏检查

**验收标准**：
- [ ] 性能测试通过
- [ ] 无明显内存泄漏
- [ ] 流式响应流畅

---

#### 5.4.3 完善文档（0.5 天）

**文档清单**：
- [x] domain-layer-refactor.md
- [x] hook-thinning-plan.md
- [x] implementation-roadmap.md
- [ ] README.md（更新）
- [ ] API.md（新增）

**验收标准**：
- [ ] 文档完整
- [ ] 示例代码清晰
- [ ] 架构图准确

---

#### 5.4.4 代码审查与重构（1 天）

**检查项**：
- 代码风格一致
- 类型定义完整
- 错误处理完善
- 边界情况处理
- 命名清晰

**验收标准**：
- [ ] Code review 通过
- [ ] Linter 无警告
- [ ] TypeScript 无错误

---

#### 5.4.5 最终测试（0.5 天）

**测试清单**：
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过
- [ ] E2E 测试通过
- [ ] 手动测试通过

---

### 第四阶段总结

**交付物**：
- ✅ 清理后的代码
- ✅ 性能优化
- ✅ 完善的文档
- ✅ 通过所有测试

**时间投入**：3-5 天

**风险**：低（主要是清理工作）

---

## 六、风险管理

### 6.1 风险识别

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构引入 bug | 高 | 中 | 充分测试，渐进式迁移 |
| 性能下降 | 中 | 低 | 性能测试，优化热点 |
| 学习成本高 | 中 | 中 | 文档完善，代码 review |
| 时间延期 | 中 | 中 | 分阶段交付，灵活调整 |

### 6.2 回滚计划

如果新架构有严重问题，可以快速回滚：

```typescript
// 紧急回滚
const USE_NEW_CHAT_SUBMIT = false  // 切换回旧实现
```

**回滚步骤**：
1. 切换 feature flag
2. 重新部署
3. 分析问题
4. 修复后重新上线

---

## 七、成功标准

### 7.1 代码质量

- [ ] Hook 代码行数 < 100 行（↓ 75%）
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试覆盖率 > 60%
- [ ] TypeScript 无错误
- [ ] Linter 无警告

### 7.2 性能指标

- [ ] 首次渲染时间 < 100ms
- [ ] 消息提交响应时间 < 500ms
- [ ] 流式响应延迟 < 100ms
- [ ] 内存无明显泄漏

### 7.3 可维护性

- [ ] 职责清晰（每个类/函数单一职责）
- [ ] 易于理解（新成员 1 天内理解架构）
- [ ] 易于扩展（添加新功能 < 1 天）
- [ ] 易于测试（所有服务可独立测试）

---

## 八、总结

本实施路线图将 `useChatSubmit` 重构分为 4 个阶段：

1. **第一阶段**：基础设施层（1 周）- 低风险
2. **第二阶段**：领域服务层（1 周）- 中风险
3. **第三阶段**：Hook 薄化（1 周）- 高风险
4. **第四阶段**：优化与清理（3-5 天）- 低风险

**总时间**：3-4 周

**预期收益**：
- 代码行数 ↓ 75%
- 可测试性 ↑ 80%
- 可维护性 ↑ 显著提升
- 开发效率 ↑ 30%

这是一次值得的重构，将为项目的长期发展奠定坚实基础。
