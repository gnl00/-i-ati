# 事件驱动架构设计

## 一、核心思想

使用事件驱动模式解决领域层与 UI 层的解耦问题：

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (Hook)                                        │
│  - 监听事件                                              │
│  - 更新 UI 状态                                          │
└────────────────┬────────────────────────────────────────┘
                 │ subscribe
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Event Bus                                              │
│  - message.receive                                        │
│  - message.update                                       │
│  - tool.executing                                       │
│  - streaming.start / streaming.end                      │
└────────────────┬────────────────────────────────────────┘
                 │ emit
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Domain Layer (Services)                                │
│  - 发出事件                                              │
│  - 不关心 UI 如何响应                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 二、事件定义

### 2.1 事件类型

```typescript
// src/renderer/src/domain/events/ChatEvents.ts

/**
 * 聊天相关事件
 */
export enum ChatEventType {
  // 消息事件
  MESSAGE_RECEIVE = 'message.receive',           // 收到新的消息片段
  MESSAGE_RECEIVE = 'message.receive',           // 收到新的消息片段
  MESSAGE_UPDATE = 'message.update',         // 消息更新
  MESSAGE_COMPLETE = 'message.complete',     // 消息完成

  // 流式处理事件
  STREAMING_START = 'streaming.start',       // 开始流式处理
  STREAMING_END = 'streaming.end',           // 流式处理结束
  STREAMING_ERROR = 'streaming.error',       // 流式处理错误

  // 工具调用事件
  TOOL_CALL_START = 'tool.call.start',       // 工具调用开始
  TOOL_CALL_PROGRESS = 'tool.call.progress', // 工具调用进度
  TOOL_CALL_COMPLETE = 'tool.call.complete', // 工具调用完成
  TOOL_CALL_ERROR = 'tool.call.error',       // 工具调用错误

  // 会话事件
  SESSION_CREATED = 'session.created',       // 会话创建
  SESSION_UPDATED = 'session.updated',       // 会话更新

  // 状态事件
  STATE_CHANGE = 'state.change',             // 状态变化
}

/**
 * 事件数据接口
 */
export interface ChatEventData {
  [ChatEventType.MESSAGE_RECEIVE]: {
    messageId: string
    content: string
    delta: string
  }

  [ChatEventType.MESSAGE_UPDATE]: {
    messageId: string
    message: MessageEntity
  }

  [ChatEventType.MESSAGE_COMPLETE]: {
    messageId: string
    message: MessageEntity
  }

  [ChatEventType.STREAMING_START]: {
    requestId: string
  }

  [ChatEventType.STREAMING_END]: {
    requestId: string
    success: boolean
  }

  [ChatEventType.STREAMING_ERROR]: {
    requestId: string
    error: Error
  }

  [ChatEventType.TOOL_CALL_START]: {
    toolCallId: string
    toolName: string
    args: any
  }

  [ChatEventType.TOOL_CALL_PROGRESS]: {
    toolCallId: string
    progress: number
    message?: string
  }

  [ChatEventType.TOOL_CALL_COMPLETE]: {
    toolCallId: string
    result: any
  }

  [ChatEventType.TOOL_CALL_ERROR]: {
    toolCallId: string
    error: Error
  }

  [ChatEventType.SESSION_CREATED]: {
    chatId: number
    chatUuid: string
    chatEntity: ChatEntity
  }

  [ChatEventType.SESSION_UPDATED]: {
    chatId: number
    updates: Partial<ChatEntity>
  }

  [ChatEventType.STATE_CHANGE]: {
    from: string
    to: string
  }
}

/**
 * 事件对象
 */
export interface ChatEvent<T extends ChatEventType = ChatEventType> {
  type: T
  data: ChatEventData[T]
  timestamp: number
}
```

---

## 三、事件总线实现

### 3.1 EventBus 基础实现

```typescript
// src/renderer/src/domain/events/EventBus.ts

type EventHandler<T = any> = (data: T) => void | Promise<void>

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>()

  /**
   * 订阅事件
   */
  on<T extends ChatEventType>(
    eventType: T,
    handler: EventHandler<ChatEventData[T]>
  ): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }

    this.handlers.get(eventType)!.add(handler)

    // 返回取消订阅函数
    return () => {
      this.handlers.get(eventType)?.delete(handler)
    }
  }

  /**
   * 发出事件
   */
  async emit<T extends ChatEventType>(
    eventType: T,
    data: ChatEventData[T]
  ): Promise<void> {
    const handlers = this.handlers.get(eventType)
    if (!handlers || handlers.size === 0) return

    const event: ChatEvent<T> = {
      type: eventType,
      data,
      timestamp: Date.now()
    }

    // 并发执行所有处理器
    await Promise.all(
      Array.from(handlers).map(handler =>
        Promise.resolve(handler(data))
      )
    )
  }

  /**
   * 一次性订阅
   */
  once<T extends ChatEventType>(
    eventType: T,
    handler: EventHandler<ChatEventData[T]>
  ): () => void {
    const wrappedHandler = (data: ChatEventData[T]) => {
      handler(data)
      unsubscribe()
    }

    const unsubscribe = this.on(eventType, wrappedHandler)
    return unsubscribe
  }

  /**
   * 清空所有订阅
   */
  clear(): void {
    this.handlers.clear()
  }

  /**
   * 清空特定事件的订阅
   */
  clearEvent(eventType: ChatEventType): void {
    this.handlers.delete(eventType)
  }
}

// 全局单例
export const chatEventBus = new EventBus()
```

---

## 四、领域服务层集成

### 4.1 ChatSubmissionService 使用事件

```typescript
// src/renderer/src/domain/chat/ChatSubmissionService.ts

export class ChatSubmissionService {
  constructor(
    private readonly messageService: MessageService,
    private readonly chatService: ChatService,
    private readonly requestBuilder: RequestBuilder,
    private readonly streamingOrchestrator: StreamingOrchestrator,
    private readonly toolService: ToolService,
    private readonly titleGenerator: TitleGenerator,
    private readonly eventBus: EventBus  // 注入事件总线
  ) {}

  async submit(
    input: ChatInput,
    model: IModel,
    providers: IProvider[]
  ): Promise<ChatResult> {
    const requestId = generateId()

    try {
      // 发出开始事件
      await this.eventBus.emit(ChatEventType.STREAMING_START, { requestId })

      // 1. 准备会话
      const session = await this.prepareSession(input, model, providers)

      // 发出会话创建事件
      await this.eventBus.emit(ChatEventType.SESSION_CREATED, {
        chatId: session.chatId,
        chatUuid: session.chatUuid,
        chatEntity: session.chatEntity
      })

      // 2. 构建请求
      const request = this.requestBuilder.build(session, input)

      // 3. 流式处理（内部会发出 message.receive 事件）
      const streamingResult = await this.streamingOrchestrator.execute(
        request,
        this.eventBus  // 传递事件总线
      )

      // 4. 持久化结果
      const result = await this.persistResult(streamingResult)

      // 发出消息完成事件
      await this.eventBus.emit(ChatEventType.MESSAGE_COMPLETE, {
        messageId: result.messages[result.messages.length - 1].id,
        message: result.messages[result.messages.length - 1]
      })

      // 5. 生成标题
      if (this.shouldGenerateTitle(result.chatEntity)) {
        result.title = await this.titleGenerator.generate(
          input.textCtx,
          model,
          providers
        )

        await this.eventBus.emit(ChatEventType.SESSION_UPDATED, {
          chatId: result.chatEntity.id,
          updates: { title: result.title }
        })
      }

      // 发出结束事件
      await this.eventBus.emit(ChatEventType.STREAMING_END, {
        requestId,
        success: true
      })

      return result

    } catch (error: any) {
      // 发出错误事件
      await this.eventBus.emit(ChatEventType.STREAMING_ERROR, {
        requestId,
        error
      })
      throw error
    }
  }
}
```

### 4.2 StreamingOrchestrator 发出事件

```typescript
// src/renderer/src/hooks/chatSubmit/streaming/orchestrator.ts

export class StreamingOrchestrator {
  async execute(
    request: PreparedRequest,
    eventBus: EventBus  // 接收事件总线
  ): Promise<StreamingContext> {
    const messageId = generateId()
    let accumulatedContent = ''

    // 流式处理
    for await (const chunk of this.networkClient.streamChat(request)) {
      if (chunk.content) {
        accumulatedContent += chunk.content

        // 发出 chunk 事件
        await eventBus.emit(ChatEventType.MESSAGE_RECEIVE, {
          messageId,
          content: accumulatedContent,
          delta: chunk.content
        })
      }

      // 处理工具调用
      if (chunk.toolCalls) {
        for (const toolCall of chunk.toolCalls) {
          // 发出工具调用开始事件
          await eventBus.emit(ChatEventType.TOOL_CALL_START, {
            toolCallId: toolCall.id,
            toolName: toolCall.function,
            args: toolCall.args
          })

          // 执行工具
          const result = await this.toolService.executeToolCall(toolCall)

          // 发出工具调用完成事件
          await eventBus.emit(ChatEventType.TOOL_CALL_COMPLETE, {
            toolCallId: toolCall.id,
            result
          })
        }
      }
    }

    return { /* ... */ }
  }
}
```

---

## 五、Hook 层集成

### 5.1 useChatSubmit 监听事件

```typescript
// src/renderer/src/hooks/chatSubmit/index.tsx

function useChatSubmit() {
  const { setMessages } = useChatStore()
  const { setChatId, setChatUuid, updateChatList } = useChatContext()
  const { setShowLoadingIndicator, setFetchState } = useChatStore()

  const eventBus = useMemo(() => chatEventBus, [])

  // 订阅事件
  useEffect(() => {
    // 监听消息 chunk
    const unsubChunk = eventBus.on(
      ChatEventType.MESSAGE_RECEIVE,
      ({ messageId, content, delta }) => {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg.id === messageId) {
            return [...prev.slice(0, -1), { ...lastMsg, content }]
          }
          return prev
        })
      }
    )

    // 监听流式处理开始
    const unsubStart = eventBus.on(
      ChatEventType.STREAMING_START,
      () => {
        setShowLoadingIndicator(true)
        setFetchState(true)
      }
    )

    // 监听流式处理结束
    const unsubEnd = eventBus.on(
      ChatEventType.STREAMING_END,
      () => {
        setShowLoadingIndicator(false)
        setFetchState(false)
      }
    )

    // 监听会话创建
    const unsubSession = eventBus.on(
      ChatEventType.SESSION_CREATED,
      ({ chatId, chatUuid, chatEntity }) => {
        setChatId(chatId)
        setChatUuid(chatUuid)
        updateChatList(chatEntity)
      }
    )

    // 监听工具调用
    const unsubToolStart = eventBus.on(
      ChatEventType.TOOL_CALL_START,
      ({ toolName }) => {
        console.log(`Tool ${toolName} started`)
      }
    )

    // 清理订阅
    return () => {
      unsubChunk()
      unsubStart()
      unsubEnd()
      unsubSession()
      unsubToolStart()
    }
  }, [eventBus, setMessages, setChatId, setChatUuid, updateChatList])

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[], prompt: string }
  ) => {
    const service = new ChatSubmissionService(
      messageService,
      chatService,
      requestBuilder,
      streamingOrchestrator,
      toolService,
      titleGenerator,
      eventBus  // 传入事件总线
    )

    try {
      await service.submit(
        { textCtx, mediaCtx, tools: options.tools, prompt: options.prompt },
        selectedModel!,
        providers
      )
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast.error(error.message)
      }
    }
  }

  return onSubmit
}
```

---

## 六、优势分析

### 6.1 与回调方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **回调方案** | 简单直接 | 领域层依赖 UI 层，耦合度高 |
| **事件驱动** | 完全解耦，易于扩展 | 增加一层抽象，调试稍复杂 |

### 6.2 事件驱动的优势

1. **完全解耦**
   - 领域层不知道 UI 层的存在
   - UI 层可以自由选择如何响应事件

2. **易于扩展**
   - 添加新的事件监听器不影响现有代码
   - 可以同时有多个监听器处理同一事件

3. **易于测试**
   - 领域层测试：验证是否发出正确的事件
   - UI 层测试：验证是否正确响应事件

4. **支持多种 UI**
   - 同一个领域层可以支持不同的 UI 实现
   - 例如：Web UI、Electron UI、CLI

---

## 七、实施建议

### 7.1 渐进式迁移

**阶段 1：引入事件系统（1-2 天）**
- 实现 EventBus
- 定义事件类型
- 编写单元测试

**阶段 2：迁移 StreamingOrchestrator（2-3 天）**
- 在 StreamingOrchestrator 中发出事件
- Hook 层监听事件并更新 UI
- 保持现有回调作为备用

**阶段 3：迁移其他服务（3-5 天）**
- MessageService 发出事件
- ChatService 发出事件
- ToolService 发出事件

**阶段 4：移除回调（1 天）**
- 确认事件系统稳定后移除回调
- 清理冗余代码

### 7.2 注意事项

1. **性能考虑**
   - 事件处理器应该尽量轻量
   - 避免在事件处理器中执行耗时操作
   - 考虑使用节流/防抖

2. **错误处理**
   - 事件处理器中的错误不应影响其他处理器
   - 考虑添加全局错误处理

3. **内存泄漏**
   - 确保组件卸载时取消订阅
   - 使用 useEffect 的清理函数

4. **调试**
   - 添加事件日志
   - 使用 Redux DevTools 风格的事件追踪

---

## 八、总结

事件驱动模式完美解决了领域层与 UI 层的解耦问题：

- ✅ **领域层保持纯净**：只负责业务逻辑，发出事件
- ✅ **实时更新 UI**：每个 chunk 都能立即反映到界面
- ✅ **易于测试**：领域层和 UI 层可以独立测试
- ✅ **易于扩展**：添加新功能只需添加新的事件监听器

这是一个值得采用的架构模式，建议优先实施。
