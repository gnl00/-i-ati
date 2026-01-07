# 领域层重构方案

## 一、背景与目标

### 1.1 当前问题

在 `useChatSubmit` Hook 中，存在以下职责混杂的问题：

- **消息预处理**：构建消息、创建会话、数据库操作
- **请求构建**：过滤消息、准备工具、构建请求对象
- **流式处理**：处理 stream、解析 chunk、更新 UI
- **工具调用**：执行工具、处理结果、更新消息
- **收尾处理**：保存消息、生成标题、更新列表

**导致的问题**：
1. Hook 代码过于复杂，难以理解和维护
2. 业务逻辑与 UI 状态管理耦合
3. 难以单独测试业务逻辑
4. 职责边界模糊，扩展困难

### 1.2 重构目标

**核心目标**：将业务逻辑从 Hook 中分离，形成清晰的分层架构

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (Hook + Component)                            │
│  - 只负责 UI 状态管理                                    │
│  - 调用领域服务                                          │
└────────────────┬────────────────────────────────────────┘
                 │ 调用
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Domain Layer (领域服务层)                              │
│  - ChatSubmissionService: 协调聊天提交流程              │
│  - MessageService: 消息管理                             │
│  - ToolService: 工具调用管理                            │
│  - RequestBuilder: 请求构建                             │
└────────────────┬────────────────────────────────────────┘
                 │ 调用
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Infrastructure Layer (基础设施层)                      │
│  - MessageRepository: 消息持久化                        │
│  - ChatRepository: 聊天持久化                           │
│  - NetworkClient: 网络请求                              │
└─────────────────────────────────────────────────────────┘
```

---

## 二、领域服务层设计

### 2.1 ChatSubmissionService（聊天提交服务）

**职责**：协调聊天提交的完整流程

```typescript
// src/renderer/src/domain/chat/ChatSubmissionService.ts

export interface ChatInput {
  textCtx: string
  mediaCtx: ClipbordImg[] | string[]
  tools?: any[]
  prompt?: string
}

export interface ChatResult {
  messages: MessageEntity[]
  chatEntity: ChatEntity
  title?: string
}

export class ChatSubmissionService {
  constructor(
    private readonly messageService: MessageService,
    private readonly chatService: ChatService,
    private readonly requestBuilder: RequestBuilder,
    private readonly streamingOrchestrator: StreamingOrchestrator,
    private readonly toolService: ToolService,
    private readonly titleGenerator: TitleGenerator
  ) {}

  /**
   * 提交聊天请求
   * @param input 用户输入
   * @param model 使用的模型
   * @param providers 可用的提供商
   * @returns 聊天结果
   */
  async submit(
    input: ChatInput,
    model: IModel,
    providers: IProvider[]
  ): Promise<ChatResult> {
    // 1. 准备阶段：创建/获取会话，保存用户消息
    const session = await this.prepareSession(input, model, providers)

    // 2. 构建请求
    const request = this.requestBuilder.build(session, input)

    // 3. 流式处理 + 工具调用循环
    const streamingResult = await this.streamingOrchestrator.execute(request)

    // 4. 持久化结果
    const result = await this.persistResult(streamingResult)

    // 5. 生成标题（如果需要）
    if (this.shouldGenerateTitle(result.chatEntity)) {
      result.title = await this.titleGenerator.generate(
        input.textCtx,
        model,
        providers
      )
    }

    return result
  }

  private async prepareSession(
    input: ChatInput,
    model: IModel,
    providers: IProvider[]
  ): Promise<ChatSession> {
    return this.chatService.getOrCreateSession(model, providers)
  }

  private async persistResult(
    result: StreamingResult
  ): Promise<ChatResult> {
    return this.messageService.saveMessages(result)
  }

  private shouldGenerateTitle(chat: ChatEntity): boolean {
    return !chat.title || chat.title === 'NewChat'
  }
}
```

**关键设计点**：
- ✅ **纯业务逻辑**：不涉及 UI 状态管理
- ✅ **可测试**：所有依赖通过构造函数注入
- ✅ **职责单一**：只负责协调各个服务
- ✅ **返回纯数据**：不直接调用 `setMessages` 等 UI 方法

---

### 2.2 MessageService（消息服务）

**职责**：消息的创建、更新、持久化

```typescript
// src/renderer/src/domain/chat/MessageService.ts

export class MessageService {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly messageFactory: MessageFactory
  ) {}

  /**
   * 创建并保存用户消息
   */
  async createUserMessage(
    input: ChatInput,
    chatId: number,
    chatUuid: string,
    model: IModel
  ): Promise<MessageEntity> {
    const message = this.messageFactory.createUserMessage(
      input.textCtx,
      input.mediaCtx,
      model,
      chatId,
      chatUuid
    )
    return this.messageRepository.save(message)
  }

  /**
   * 创建助手消息占位符
   */
  createAssistantPlaceholder(model: IModel): MessageEntity {
    return this.messageFactory.createAssistantPlaceholder(model)
  }

  /**
   * 批量保存消息
   */
  async saveMessages(messages: MessageEntity[]): Promise<void> {
    await this.messageRepository.saveBatch(messages)
  }

  /**
   * 更新消息内容
   */
  async updateMessage(
    messageId: number,
    updates: Partial<MessageEntity>
  ): Promise<void> {
    await this.messageRepository.update(messageId, updates)
  }
}
```

---

### 2.3 ChatService（聊天服务）

**职责**：聊天会话的管理

```typescript
// src/renderer/src/domain/chat/ChatService.ts

export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly workspaceService: WorkspaceService
  ) {}

  /**
   * 获取或创建聊天会话
   */
  async getOrCreateSession(
    model: IModel,
    providers: IProvider[]
  ): Promise<ChatSession> {
    // 如果已有会话，直接返回
    // 如果没有，创建新会话
  }

  /**
   * 更新聊天会话
   */
  async updateChat(chatId: number, updates: Partial<ChatEntity>): Promise<void> {
    await this.chatRepository.update(chatId, updates)
  }

  /**
   * 生成聊天标题
   */
  async generateTitle(
    chatId: number,
    content: string,
    model: IModel,
    providers: IProvider[]
  ): Promise<string> {
    // 调用标题生成服务
  }
}
```

---

### 2.4 RequestBuilder（请求构建器）

**职责**：构建 API 请求对象

```typescript
// src/renderer/src/domain/chat/RequestBuilder.ts

export class RequestBuilder {
  /**
   * 构建请求对象
   */
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
    // 准备工具列表
  }
}
```

---

### 2.5 ToolService（工具服务）

**职责**：工具调用的管理

```typescript
// src/renderer/src/domain/chat/ToolService.ts

export class ToolService {
  constructor(
    private readonly toolExecutor: ToolExecutor,
    private readonly toolRegistry: ToolRegistry
  ) {}

  /**
   * 执行工具调用
   */
  async executeToolCalls(
    toolCalls: ToolCallProps[],
    signal: AbortSignal
  ): Promise<ToolExecutionResult[]> {
    return this.toolExecutor.execute(toolCalls, { signal })
  }

  /**
   * 格式化工具结果
   */
  formatToolResult(name: string, result: any): string {
    const formatter = this.toolRegistry.getFormatter(name)
    return formatter.format(result)
  }
}
```

---

## 三、基础设施层设计

### 3.1 Repository（仓储层）

**职责**：数据持久化

```typescript
// src/renderer/src/infrastructure/repositories/MessageRepository.ts

export class MessageRepository {
  /**
   * 保存消息
   */
  async save(message: MessageEntity): Promise<number> {
    return saveMessage(message)
  }

  /**
   * 批量保存
   */
  async saveBatch(messages: MessageEntity[]): Promise<number[]> {
    return Promise.all(messages.map(msg => this.save(msg)))
  }

  /**
   * 更新消息
   */
  async update(messageId: number, updates: Partial<MessageEntity>): Promise<void> {
    // 实现更新逻辑
  }
}
```

---

### 3.2 NetworkClient（网络客户端）

**职责**：网络请求的抽象

```typescript
// src/renderer/src/infrastructure/network/NetworkClient.ts

export interface INetworkClient {
  streamChat(
    request: IUnifiedRequest,
    signal: AbortSignal
  ): AsyncIterable<IUnifiedResponse>
}

/**
 * Renderer 进程实现
 */
export class RendererNetworkClient implements INetworkClient {
  async *streamChat(
    request: IUnifiedRequest,
    signal: AbortSignal
  ): AsyncIterable<IUnifiedResponse> {
    beforeFetch()
    try {
      const response = await unifiedChatRequest(
        request,
        signal,
        () => {},
        () => {}
      )

      if (request.stream === false) {
        yield response
      } else {
        yield* response as AsyncIterable<IUnifiedResponse>
      }
    } finally {
      afterFetch()
    }
  }
}

/**
 * Main 进程实现（可选）
 */
export class MainNetworkClient implements INetworkClient {
  constructor(private readonly ipc: IPC) {}

  async *streamChat(
    request: IUnifiedRequest,
    signal: AbortSignal
  ): AsyncIterable<IUnifiedResponse> {
    // 通过 IPC 调用 main 进程
    yield* this.ipc.stream('chat:request', { request, signal })
  }
}
```

---

## 四、与现有架构的对比

### 4.1 现有架构

```
useChatSubmit (Hook)
  ├─ prepareV2           (消息预处理、数据库操作)
  ├─ buildRequestV2      (请求构建)
  ├─ createStreamingV2   (流式处理)
  │   └─ StreamingSessionMachine
  │       └─ StreamingOrchestrator
  │           ├─ 发送请求 (unifiedChatRequest)
  │           ├─ 解析 chunk
  │           ├─ 更新消息 (setMessages)
  │           └─ 执行工具
  └─ finalizePipelineV2  (收尾处理)
```

**问题**：
- Hook 承担了太多职责
- 业务逻辑与 UI 状态耦合
- 难以单独测试

---

### 4.2 重构后的架构

```
useChatSubmit (Hook)
  └─ ChatSubmissionService.submit()
      ├─ MessageService.createUserMessage()
      ├─ ChatService.getOrCreateSession()
      ├─ RequestBuilder.build()
      ├─ StreamingOrchestrator.execute()
      │   ├─ NetworkClient.streamChat()
      │   ├─ ResponseParser.parse()
      │   ├─ MessageService.updateMessage()
      │   └─ ToolService.executeToolCalls()
      └─ MessageService.saveMessages()
```

**优势**：
- Hook 只负责 UI 状态管理
- 业务逻辑在领域服务中
- 每个服务职责单一
- 易于测试

---

## 五、依赖注入设计

### 5.1 Service Container

```typescript
// src/renderer/src/domain/ServiceContainer.ts

export class ServiceContainer {
  private static instance: ServiceContainer

  private services: Map<string, any> = new Map()

  static getInstance(): ServiceContainer {
    if (!this.instance) {
      this.instance = new ServiceContainer()
    }
    return this.instance
  }

  register<T>(key: string, factory: () => T): void {
    this.services.set(key, factory())
  }

  get<T>(key: string): T {
    const service = this.services.get(key)
    if (!service) {
      throw new Error(`Service not found: ${key}`)
    }
    return service as T
  }
}

// 初始化
export function initializeServices() {
  const container = ServiceContainer.getInstance()

  // 基础设施层
  container.register('messageRepository', () => new MessageRepository())
  container.register('chatRepository', () => new ChatRepository())
  container.register('networkClient', () => new RendererNetworkClient())

  // 领域服务层
  container.register('messageService', () => new MessageService(
    container.get('messageRepository'),
    new MessageFactory()
  ))

  container.register('chatService', () => new ChatService(
    container.get('chatRepository'),
    new WorkspaceService()
  ))

  container.register('toolService', () => new ToolService(
    new ToolExecutor({ maxConcurrency: 3 }),
    new ToolRegistry()
  ))

  container.register('chatSubmissionService', () => new ChatSubmissionService(
    container.get('messageService'),
    container.get('chatService'),
    new RequestBuilder(),
    new StreamingOrchestrator(),
    container.get('toolService'),
    new TitleGenerator()
  ))
}
```

---

## 六、实施计划

### 6.1 第一阶段：提取领域服务（1周）

1. 创建 `domain/chat` 目录结构
2. 实现 `MessageService`
3. 实现 `ChatService`
4. 实现 `RequestBuilder`
5. 实现 `ToolService`
6. 编写单元测试

### 6.2 第二阶段：重构 Hook（3-5天）

1. 实现 `ChatSubmissionService`
2. 修改 `useChatSubmit` 使用服务层
3. Hook 只保留 UI 状态管理
4. 集成测试

### 6.3 第三阶段：优化与清理（2-3天）

1. 移除冗余代码
2. 优化类型定义
3. 完善文档
4. 性能测试

---

## 七、预期收益

### 7.1 代码质量

- ✅ **职责清晰**：Hook 只负责 UI，服务层负责业务逻辑
- ✅ **易于测试**：每个服务都可以单独测试
- ✅ **易于维护**：修改业务逻辑不影响 UI
- ✅ **易于扩展**：添加新功能只需添加新服务

### 7.2 可维护性

| 指标 | 当前 | 重构后 | 改善 |
|------|------|--------|------|
| Hook 代码行数 | ~400 行 | ~80 行 | ↓ 80% |
| 职责数量 | 5 个 | 1 个 | ↓ 80% |
| 可测试性 | 低 | 高 | ↑ |
| 扩展难度 | 高 | 低 | ↓ |

### 7.3 开发体验

- ✅ 新功能开发更快
- ✅ Bug 修复更简单
- ✅ 代码审查更容易
- ✅ 新人上手更快

---

## 八、注意事项

### 8.1 兼容性

- 保持对外 API 不变
- 渐进式重构，逐步迁移
- 充分的测试覆盖

### 8.2 性能

- 避免过度抽象
- 服务实例复用（单例模式）
- 注意内存泄漏

### 8.3 测试

- 单元测试覆盖率 > 80%
- 集成测试覆盖核心流程
- E2E 测试保证功能完整

---

## 九、总结

通过引入领域服务层，我们可以：

1. **分离关注点**：UI 和业务逻辑分离
2. **提高可测试性**：每个服务都可以单独测试
3. **降低复杂度**：每个服务职责单一
4. **提高可维护性**：修改业务逻辑不影响 UI

这是一次值得的重构，预计投入 2-3 周时间，可以带来长期的质量提升。
