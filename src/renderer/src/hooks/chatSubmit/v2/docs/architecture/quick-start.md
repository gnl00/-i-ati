# 快速开始指南

## 一、概述

本文档帮助开发者快速理解和使用重构后的聊天提交架构。

### 1.1 核心概念

重构后的架构分为三层：

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (Hook)                                        │
│  - useChatSubmit: 只负责 UI 状态管理                    │
│  - 监听事件，更新 UI                                    │
└────────────────┬────────────────────────────────────────┘
                 │ 调用
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Domain Layer (领域服务)                                │
│  - ChatSubmissionService: 协调聊天提交流程             │
│  - MessageService: 消息管理                             │
│  - ChatService: 聊天会话管理                            │
│  - StreamingOrchestrator: 流式处理                      │
└────────────────┬────────────────────────────────────────┘
                 │ 调用
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Infrastructure Layer (基础设施)                        │
│  - MessageRepository: 消息持久化                        │
│  - NetworkClient: 网络请求                              │
│  - EventBus: 事件总线                                   │
└─────────────────────────────────────────────────────────┘
```

### 1.2 设计原则

1. **单一职责**：每个类/函数只做一件事
2. **依赖注入**：通过构造函数注入依赖
3. **事件驱动**：通过事件总线解耦组件
4. **易于测试**：所有服务都可以独立测试

---

## 二、使用 Hook

### 2.1 基本用法

```typescript
import useChatSubmit from '@renderer/hooks/useChatSubmit'

function ChatComponent() {
  const { onSubmit, isSubmitting } = useChatSubmit()

  const handleSubmit = async () => {
    try {
      await onSubmit(
        '你好',                  // textCtx: 文本内容
        [],                      // mediaCtx: 图片/媒体
        {                        // options: 选项
          tools: [],             // 自定义工具
          prompt: ''             // 自定义系统提示
        }
      )
    } catch (error) {
      console.error('提交失败:', error)
    }
  }

  return (
    <button onClick={handleSubmit} disabled={isSubmitting}>
      {isSubmitting ? '发送中...' : '发送'}
    </button>
  )
}
```

### 2.2 Hook 返回值

```typescript
const {
  onSubmit,        // 提交函数
  isSubmitting,    // 是否正在提交
  error           // 错误信息（如果有）
} = useChatSubmit()
```

---

## 三、事件监听

### 3.1 可用的事件

```typescript
export interface ChatEvents {
  // 消息创建
  'message.created': MessageEntity

  // 消息更新
  'message.updated': { id: number; updates: Partial<MessageEntity> }

  // 流式响应片段
  'streaming.chunk': {
    type: 'text' | 'reasoning'
    content: string
    timestamp: number
  }

  // 流式完成
  'streaming.completed': ChatResult

  // 工具开始执行
  'tool.started': { id: string; name: string }

  // 工具执行完成
  'tool.completed': {
    id: string
    name: string
    result: any
    cost: number
  }

  // 工具执行失败
  'tool.failed': {
    id: string
    name: string
    error: Error
  }
}
```

### 3.2 监听事件

```typescript
import { useEventBus, useEvent } from '@renderer/shared/useEventBus'
import type { ChatEvents } from '@renderer/shared/chatEvents'

function MyComponent() {
  const eventBus = useEventBus<ChatEvents>()

  // 监听消息创建
  useEvent(eventBus, 'message.created', (message) => {
    console.log('新消息:', message)
  })

  // 监听流式响应
  useEvent(eventBus, 'streaming.chunk', (chunk) => {
    console.log('收到片段:', chunk)
  })

  // 监听工具执行
  useEvent(eventBus, 'tool.completed', ({ name, result }) => {
    console.log(`工具 ${name} 执行完成:`, result)
  })

  return <div>...</div>
}
```

---

## 四、使用服务层

### 4.1 获取服务实例

```typescript
import { useService } from '@renderer/hooks/useService'
import type { ChatSubmissionService } from '@renderer/domain/chat/ChatSubmissionService'

function MyComponent() {
  const chatService = useService<ChatSubmissionService>('chatSubmissionService')

  const handleSubmit = async () => {
    const result = await chatService.submit(
      { textCtx: '你好', mediaCtx: [], tools: [], prompt: '' },
      selectedModel,
      providers
    )

    console.log('聊天结果:', result)
  }

  return <button onClick={handleSubmit}>提交</button>
}
```

### 4.2 可用的服务

```typescript
// 消息服务
const messageService = useService<MessageService>('messageService')

// 聊天服务
const chatService = useService<ChatService>('chatService')

// 工具服务
const toolService = useService<ToolService>('toolService')

// 流式编排器
const streamingOrchestrator = useService<StreamingOrchestrator>('streamingOrchestrator')

// 聊天提交服务（主服务）
const chatSubmissionService = useService<ChatSubmissionService>('chatSubmissionService')
```

---

## 五、自定义扩展

### 5.1 添加自定义工具

```typescript
// 1. 定义工具
const myTool: ITool = {
  type: 'function',
  function: {
    name: 'my_custom_tool',
    description: '我的自定义工具',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '参数1' }
      },
      required: ['param1']
    }
  }
}

// 2. 注册工具
import { embeddedToolsRegistry } from '@tools/index'
embeddedToolsRegistry.registerTool(myTool)

// 3. 使用工具
await onSubmit(
  '调用我的工具',
  [],
  { tools: [myTool], prompt: '' }
)
```

### 5.2 添加自定义事件处理器

```typescript
import { useEventBus, useEvent } from '@renderer/shared/useEventBus'

function CustomComponent() {
  const eventBus = useEventBus<ChatEvents>()

  // 自定义事件处理
  useEvent(eventBus, 'tool.completed', ({ name, result }) => {
    if (name === 'my_custom_tool') {
      // 自定义处理逻辑
      console.log('我的工具执行结果:', result)
    }
  })

  return <div>...</div>
}
```

### 5.3 自定义网络客户端

```typescript
import type { INetworkClient } from '@renderer/infrastructure/network/NetworkClient'

// 自定义实现
class CustomNetworkClient implements INetworkClient {
  async *streamChat(
    request: IUnifiedRequest,
    signal: AbortSignal
  ): AsyncIterable<IUnifiedResponse> {
    // 自定义实现（如使用 main 进程代理）
    yield* customImplementation(request, signal)
  }
}

// 注册自定义客户端
import { ServiceContainer } from '@renderer/shared/ServiceContainer'

const container = ServiceContainer.getInstance()
container.register('networkClient', () => new CustomNetworkClient())
```

---

## 六、测试

### 6.1 测试 Hook

```typescript
import { renderHook, act } from '@testing-library/react'
import useChatSubmit from '@renderer/hooks/useChatSubmit'

describe('useChatSubmit', () => {
  it('should submit message successfully', async () => {
    const { result } = renderHook(() => useChatSubmit())

    await act(async () => {
      await result.current.onSubmit('hello', [], { tools: [], prompt: '' })
    })

    expect(result.current.isSubmitting).toBe(false)
  })
})
```

### 6.2 测试服务

```typescript
import { ChatSubmissionService } from '@renderer/domain/chat/ChatSubmissionService'

describe('ChatSubmissionService', () => {
  it('should submit chat', async () => {
    const mockDependencies = {
      messageService: mockMessageService,
      chatService: mockChatService,
      // ... 其他依赖
    }

    const service = new ChatSubmissionService(mockDependencies)

    const result = await service.submit(
      { textCtx: 'hello', mediaCtx: [], tools: [], prompt: '' },
      mockModel,
      mockProviders
    )

    expect(result.messages).toHaveLength(2) // 用户消息 + 助手消息
  })
})
```

### 6.3 测试事件监听

```typescript
import { EventBus } from '@renderer/shared/EventBus'

describe('EventBus', () => {
  it('should emit and receive events', () => {
    const bus = new EventBus<ChatEvents>()
    const handler = vi.fn()

    bus.on('message.created', handler)
    bus.emit('message.created', { id: 1, content: 'test' })

    expect(handler).toHaveBeenCalledWith({ id: 1, content: 'test' })
  })
})
```

---

## 七、常见问题

### 7.1 如何查看调试信息？

```typescript
// 启用调试模式
localStorage.setItem('debug', 'chat:*')

// 查看事件流
const eventBus = useEventBus<ChatEvents>()

// 添加日志监听器
eventBus.on('*', (event, data) => {
  console.log(`[Event] ${event}:`, data)
})
```

### 7.2 如何处理错误？

```typescript
const { onSubmit, error } = useChatSubmit()

try {
  await onSubmit('hello', [], { tools: [], prompt: '' })
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('请求已取消')
  } else if (err.name === 'NetworkError') {
    console.error('网络错误:', err.message)
  } else {
    console.error('未知错误:', err)
  }
}
```

### 7.3 如何取消正在进行的请求？

```typescript
const { onSubmit, cancel } = useChatSubmit()

// 提交请求
await onSubmit('hello', [], { tools: [], prompt: '' })

// 取消请求
cancel()
```

### 7.4 如何自定义系统提示？

```typescript
await onSubmit(
  'hello',
  [],
  {
    tools: [],
    prompt: '你是一个专业的编程助手，请用简洁的语言回答问题。'
  }
)
```

---

## 八、最佳实践

### 8.1 性能优化

```typescript
// ✅ 推荐：使用 useMemo 缓存昂贵计算
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(messages)
}, [messages])

// ❌ 避免：在每次渲染时重复计算
const expensiveValue = computeExpensiveValue(messages)
```

### 8.2 错误处理

```typescript
// ✅ 推荐：统一的错误处理
const handleSubmit = async () => {
  try {
    await onSubmit(...)
  } catch (error) {
    handleError(error)  // 统一错误处理
  }
}

// ❌ 避免：分散的错误处理
const handleSubmit = async () => {
  try {
    await onSubmit(...)
  } catch (error) {
    if (error.name === 'AbortError') {
      // ...
    } else if (error.name === 'NetworkError') {
      // ...
    }
  }
}
```

### 8.3 事件监听

```typescript
// ✅ 推荐：及时清理事件监听
useEffect(() => {
  const unsubscribe = eventBus.on('message.created', handler)
  return unsubscribe  // 清理
}, [eventBus, handler])

// ❌ 避免：不清理事件监听
useEffect(() => {
  eventBus.on('message.created', handler)
}, [])
```

---

## 九、迁移指南

### 9.1 从旧 API 迁移

**旧 API**：
```typescript
const onSubmit = useChatSubmit()
await onSubmit(textCtx, mediaCtx, { tools, prompt })
```

**新 API**（完全兼容）：
```typescript
const { onSubmit, isSubmitting, error } = useChatSubmit()
await onSubmit(textCtx, mediaCtx, { tools, prompt })
```

### 9.2 新增功能

```typescript
// 新增：获取提交状态
const { isSubmitting } = useChatSubmit()

// 新增：获取错误信息
const { error } = useChatSubmit()

// 新增：取消请求
const { cancel } = useChatSubmit()

// 新增：监听事件
useEvent(eventBus, 'streaming.chunk', handler)
```

---

## 十、资源链接

### 10.1 文档

- [领域层重构方案](./domain-layer-refactor.md)
- [Hook 薄化方案](./hook-thinning-plan.md)
- [实施路线图](./implementation-roadmap.md)
- [架构分析](../架构分析与优化方案.md)

### 10.2 代码

- UI Layer: `src/renderer/src/hooks/useChatSubmit.tsx`
- Domain Layer: `src/renderer/src/domain/chat/`
- Infrastructure Layer: `src/renderer/src/infrastructure/`
- Shared: `src/renderer/src/shared/`

### 10.3 示例

- 基本用法: `src/renderer/src/components/ChatInput.tsx`
- 事件监听: `src/renderer/src/components/ChatMessage.tsx`
- 自定义工具: `src/tools/`

---

## 十一、总结

重构后的架构具有以下优势：

- ✅ **更简洁**：Hook 从 400+ 行减少到 ~80 行
- ✅ **更易测试**：所有服务都可以独立测试
- ✅ **更易维护**：职责清晰，易于理解和修改
- ✅ **更易扩展**：添加新功能只需添加新服务或事件监听

开始使用新架构，享受更好的开发体验！
