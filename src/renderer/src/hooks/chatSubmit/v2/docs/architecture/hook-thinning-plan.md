# Hook 薄化方案

## 一、目标

将 `useChatSubmit` Hook 从当前的 **400+ 行复杂逻辑** 薄化为 **~80 行纯 UI 状态管理**。

### 1.1 当前 Hook 的问题

```typescript
// 当前实现（简化版）
function useChatSubmitV2() {
  // ❌ 问题 1：依赖过多 context
  const { chatId, setChatId, ... } = useChatContext()
  const { messages, setMessages, ... } = useChatStore()
  const { providers, ... } = useAppConfigStore()

  // ❌ 问题 2：复杂的状态管理
  const beforeFetch = () => setFetchState(true)
  const afterFetch = () => setFetchState(false)

  // ❌ 问题 3：复杂的业务逻辑
  const onSubmit = async (textCtx, mediaCtx, options) => {
    const machine = new ChatPipelineMachineV2({
      prepare: prepareV2,        // 166 行
      buildRequest: buildRequestV2,
      sendRequest: createStreamingV2,
      finalize: finalizePipelineV2
    })

    const prepareParams = { /* 17 个字段 */ }
    const finalizeDeps = { /* 9 个字段 */ }

    try {
      await machine.start({ prepareParams, finalizeDeps })
    } catch (error) {
      // 错误处理
    } finally {
      // 清理
    }
  }

  return onSubmit
}
```

**问题总结**：
- 耦合了太多业务逻辑
- 参数传递复杂（prepareParams 17 个字段，finalizeDeps 9 个字段）
- 难以测试（需要 mock 多个 store）
- 难以复用（绑定了特定的 store）

---

## 二、薄化后的 Hook

### 2.1 目标设计

```typescript
// 薄化后的实现
function useChatSubmitV2() {
  // ✅ 只保留 UI 状态管理
  const { selectedModel } = useChatStore()
  const { providers, titleGenerateModel, titleGenerateEnabled } = useAppConfigStore()

  // ✅ 获取服务实例（单例）
  const chatService = useService<ChatSubmissionService>('chatSubmissionService')

  // ✅ UI 状态
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // ✅ 简单的提交逻辑
  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[], prompt: string }
  ) => {
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      // 调用服务层，传入必要的参数
      const result = await chatService.submit(
        { textCtx, mediaCtx, tools: options.tools, prompt: options.prompt },
        selectedModel!,
        providers
      )

      // 服务层返回结果，这里只负责更新 UI
      // UI 状态可以通过事件总线或返回值更新
      return result
    } catch (err) {
      setError(err as Error)
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  return { onSubmit, isSubmitting, error }
}
```

**改善**：
- ✅ 代码行数：从 400+ 行减少到 ~80 行（↓ 80%）
- ✅ 职责单一：只负责 UI 状态管理
- ✅ 易于测试：只需 mock 服务层
- ✅ 易于复用：不绑定特定的 store

---

## 三、UI 状态同步策略

### 3.1 问题：服务层如何更新 UI？

**方案 A：返回值 + Hook 更新**（推荐）

```typescript
// Hook
function useChatSubmitV2() {
  const { setMessages, setFetchState, ... } = useChatStore()
  const chatService = useService<ChatSubmissionService>('chatSubmissionService')

  const onSubmit = async (input: ChatInput) => {
    setFetchState(true)

    try {
      // 服务返回结果
      const result = await chatService.submit(input, model, providers)

      // Hook 负责更新 UI
      setMessages(result.messages)
    } finally {
      setFetchState(false)
    }
  }
}
```

**优点**：
- ✅ 数据流向清晰
- ✅ Hook 控制更新时机
- ✅ 易于理解和调试

**缺点**：
- ❌ 无法实时更新（流式场景）

---

**方案 B：事件总线 + 响应式更新**（适合流式场景）

```typescript
// 1. 定义事件
type ChatEvents = {
  'message.created': MessageEntity
  'message.updated': { id: number; updates: Partial<MessageEntity> }
  'streaming.chunk': { content: string; reasoning: string }
  'tool.started': { name: string }
  'tool.completed': { name: string; result: any }
  'streaming.completed': ChatResult
}

// 2. Hook 监听事件
function useChatSubmitV2() {
  const { setMessages } = useChatStore()
  const eventBus = useEventBus()

  // 监听消息创建
  useEvent(eventBus, 'message.created', (message) => {
    setMessages(prev => [...prev, message])
  })

  // 监听消息更新
  useEvent(eventBus, 'message.updated', ({ id, updates }) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ))
  })

  // 监听流式更新
  useEvent(eventBus, 'streaming.chunk', ({ content, reasoning }) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          body: {
            ...last.body,
            content: last.body.content + content,
            segments: [...(last.body.segments || []), {
              type: 'text',
              content,
              timestamp: Date.now()
            }]
          }
        }
      ]
    })
  })

  // 监听工具执行
  useEvent(eventBus, 'tool.completed', ({ name, result }) => {
    // 更新 UI 显示工具结果
  })

  const onSubmit = async (input: ChatInput) => {
    // 服务层会发射事件，Hook 不需要手动更新
    return chatService.submit(input, model, providers)
  }

  return { onSubmit }
}

// 3. 服务层发射事件
class ChatSubmissionService {
  constructor(
    private readonly eventBus: EventBus<ChatEvents>
  ) {}

  async submit(input: ChatInput, model: IModel, providers: IProvider[]) {
    // 创建消息时发射事件
    const userMessage = await this.messageService.createUserMessage(...)
    this.eventBus.emit('message.created', userMessage)

    // 流式处理时发射事件
    for await (const chunk of response) {
      this.eventBus.emit('streaming.chunk', {
        content: chunk.content,
        reasoning: chunk.reasoning
      })
    }

    // 工具执行时发射事件
    this.eventBus.emit('tool.completed', { name, result })

    // 完成时发射事件
    this.eventBus.emit('streaming.completed', result)
  }
}
```

**优点**：
- ✅ 实时更新（流式场景）
- ✅ 完全解耦（服务层不依赖 UI）
- ✅ 易于扩展（添加新事件）

**缺点**：
- ❌ 复杂度增加
- ❌ 调试难度增加

---

**方案 C：混合方案**（推荐）

```typescript
// 1. 关键状态用返回值
const result = await chatService.submit(input, model, providers)

// 2. 实时更新用事件总线
eventBus.emit('streaming.chunk', chunk)

// 3. Hook 同时处理两者
function useChatSubmitV2() {
  // 监听实时事件
  useEvent(eventBus, 'streaming.chunk', handleChunk)
  useEvent(eventBus, 'tool.completed', handleTool)

  // 处理最终结果
  const onSubmit = async (input: ChatInput) => {
    const result = await chatService.submit(input, model, providers)
    setMessages(result.messages)
    return result
  }
}
```

---

### 3.2 推荐实现：简化版事件总线

```typescript
// src/renderer/src/shared/EventBus.ts

type EventListener<T> = (data: T) => void

export class EventBus<T extends Record<string, any>> {
  private listeners = new Map<keyof T, Set<EventListener<any>>>()

  on<K extends keyof T>(
    event: K,
    listener: EventListener<T[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)

    // 返回取消订阅函数
    return () => {
      this.listeners.get(event)?.delete(listener)
    }
  }

  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(data)
      } catch (error) {
        console.error(`Error in event handler for ${String(event)}:`, error)
      }
    })
  }

  clear(): void {
    this.listeners.clear()
  }
}

// Hook
export function useEventBus<T extends Record<string, any>>() {
  const bus = useMemo(() => new EventBus<T>(), [])
  return bus
}

export function useEvent<T, K extends keyof T>(
  bus: EventBus<T>,
  event: K,
  handler: EventListener<T[K]>
) {
  useEffect(() => {
    const unsubscribe = bus.on(event, handler)
    return unsubscribe
  }, [bus, event, handler])
}
```

---

## 四、具体实施步骤

### 4.1 第一步：创建服务层（参见 domain-layer-refactor.md）

1. 创建 `ChatSubmissionService`
2. 实现核心业务逻辑
3. 编写单元测试

### 4.2 第二步：创建事件总线

```bash
mkdir -p src/renderer/src/shared
```

```typescript
// src/renderer/src/shared/EventBus.ts
// （见上面的代码）

// src/renderer/src/shared/chatEvents.ts
export interface ChatEvents {
  'message.created': MessageEntity
  'message.updated': { id: number; updates: Partial<MessageEntity> }
  'streaming.chunk': StreamingChunk
  'streaming.completed': ChatResult
  'tool.started': ToolStart
  'tool.completed': ToolResult
}
```

### 4.3 第三步：重构 Hook

```typescript
// src/renderer/src/hooks/useChatSubmit.tsx

import { useService } from './useService'
import { useEventBus, useEvent } from '../shared/EventBus'
import type { ChatEvents } from '../shared/chatEvents'

function useChatSubmitV2() {
  // UI 状态
  const { selectedModel, setMessages, setFetchState, ... } = useChatStore()
  const { providers } = useAppConfigStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 服务层
  const chatService = useService<ChatSubmissionService>('chatSubmissionService')
  const eventBus = useEventBus<ChatEvents>()

  // 监听消息创建
  useEvent(eventBus, 'message.created', (message) => {
    setMessages(prev => [...prev, message])
  })

  // 监听消息更新
  useEvent(eventBus, 'message.updated', ({ id, updates }) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ))
  })

  // 监听流式更新
  useEvent(eventBus, 'streaming.chunk', (chunk) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          body: {
            ...last.body,
            segments: [
              ...(last.body.segments || []),
              {
                type: chunk.type,
                content: chunk.content,
                timestamp: Date.now()
              }
            ]
          }
        }
      ]
    })
  })

  // 提交函数
  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[], prompt: string }
  ) => {
    if (isSubmitting) return
    if (!selectedModel) {
      throw new Error('No model selected')
    }

    setIsSubmitting(true)
    setFetchState(true)

    try {
      const result = await chatService.submit(
        { textCtx, mediaCtx, tools: options.tools, prompt: options.prompt },
        selectedModel,
        providers
      )

      // 最终结果更新
      setMessages(result.messages)

      return result
    } catch (error) {
      console.error('Chat submission failed:', error)
      throw error
    } finally {
      setIsSubmitting(false)
      setFetchState(false)
    }
  }

  return { onSubmit, isSubmitting }
}
```

### 4.4 第四步：服务层集成事件总线

```typescript
// src/renderer/src/domain/chat/ChatSubmissionService.ts

export class ChatSubmissionService {
  constructor(
    private readonly eventBus: EventBus<ChatEvents>,
    private readonly messageService: MessageService,
    private readonly streamingOrchestrator: StreamingOrchestrator,
    ...
  ) {}

  async submit(input: ChatInput, model: IModel, providers: IProvider[]) {
    // 1. 创建用户消息
    const userMessage = await this.messageService.createUserMessage(...)
    this.eventBus.emit('message.created', userMessage)

    // 2. 创建助手占位符
    const assistantMessage = this.messageService.createAssistantPlaceholder(model)
    this.eventBus.emit('message.created', assistantMessage)

    // 3. 流式处理
    for await (const chunk of this.streamingOrchestrator.stream(request)) {
      this.eventBus.emit('streaming.chunk', chunk)
    }

    // 4. 完成
    this.eventBus.emit('streaming.completed', result)

    return result
  }
}
```

---

## 五、迁移策略

### 5.1 渐进式迁移

**阶段 1：并行运行**（1周）

```typescript
// 保留旧的实现
export { default as useChatSubmitLegacy } from './chatSubmit/v2'

// 新的实现
export { default as useChatSubmit } from './useChatSubmitNew'

// 通过 feature flag 切换
const USE_NEW_CHAT_SUBMIT = true

export default USE_NEW_CHAT_SUBMIT ? useChatSubmit : useChatSubmitLegacy
```

**阶段 2：逐步切换**（1周）

1. 开发环境使用新实现
2. 收集反馈和 bug
3. 修复问题

**阶段 3：完全迁移**（1周）

1. 移除旧实现
2. 清理冗余代码
3. 更新文档

---

### 5.2 兼容性保证

**保持 API 不变**：

```typescript
// 旧 API
const onSubmit = useChatSubmit()
await onSubmit(textCtx, mediaCtx, { tools, prompt })

// 新 API（完全兼容）
const onSubmit = useChatSubmit()
await onSubmit(textCtx, mediaCtx, { tools, prompt })
```

**新增可选功能**：

```typescript
// 新 API 支持返回更多状态
const { onSubmit, isSubmitting, error, lastResult } = useChatSubmit()
```

---

## 六、测试策略

### 6.1 单元测试

```typescript
// hooks/useChatSubmit.test.ts

describe('useChatSubmit', () => {
  it('should call chat service on submit', async () => {
    const mockService = {
      submit: vi.fn().mockResolvedValue({ messages: [] })
    }

    const { result } = renderHook(() => useChatSubmitV2(), {
      wrapper: ({ children }) => (
        <ServiceProvider value={{ chatSubmissionService: mockService }}>
          {children}
        </ServiceProvider>
      )
    })

    await act(async () => {
      await result.current.onSubmit('hello', [], { tools: [], prompt: '' })
    })

    expect(mockService.submit).toHaveBeenCalled()
  })

  it('should update messages when event is emitted', async () => {
    // 测试事件监听
  })
})
```

### 6.2 集成测试

```typescript
// integration/chatSubmission.test.ts

describe('Chat Submission Integration', () => {
  it('should complete full chat flow', async () => {
    // 1. 提交消息
    // 2. 接收流式响应
    // 3. 执行工具调用
    // 4. 保存结果
    // 5. 更新 UI
  })
})
```

---

## 七、预期收益

### 7.1 代码质量

| 指标 | 当前 | 薄化后 | 改善 |
|------|------|--------|------|
| Hook 代码行数 | 400+ 行 | ~80 行 | ↓ 80% |
| 职责数量 | 5 个 | 1 个 | ↓ 80% |
| 测试覆盖率 | 0% | 80%+ | ↑ |
| 可维护性 | 低 | 高 | ↑ |

### 7.2 开发体验

- ✅ **更简洁**：Hook 只关注 UI 状态
- ✅ **更易测试**：只需 mock 服务层
- ✅ **更易理解**：数据流向清晰
- ✅ **更易扩展**：添加新功能不增加复杂度

---

## 八、风险与缓解

### 8.1 风险

1. **重构风险**：可能引入 bug
   - 缓解：渐进式迁移，充分测试

2. **性能风险**：事件总线可能影响性能
   - 缓解：性能测试，优化热点

3. **学习成本**：团队需要学习新架构
   - 缓解：文档完善，代码 review

### 8.2 回滚方案

如果新架构有问题，可以快速回滚：

```typescript
// 紧急回滚
const USE_NEW_CHAT_SUBMIT = false  // 切换回旧实现
```

---

## 九、总结

通过 Hook 薄化：

1. **分离关注点**：UI 和业务逻辑完全分离
2. **提高可测试性**：Hook 可以独立测试
3. **降低复杂度**：从 400 行减少到 80 行
4. **提高可维护性**：修改 UI 不影响业务逻辑

这是整个重构的关键一步，预计投入 1-2 周时间，可以带来显著的代码质量提升。
