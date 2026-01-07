# Streaming V2 架构 - 使用指南和迁移文档

## 概述

Streaming V2 是基于**分层架构 + 责任链模式**的全新实现，解决了原架构的职责混杂、工具串行执行、代码重复、数据同步混乱等问题。

## 架构亮点

### ✅ 核心改进

1. **并行工具调用** - 工具可并行执行，性能提升 50%+
2. **职责清晰** - 每层独立，易于测试和维护
3. **消除重复代码** - segment 合并、消息更新统一处理
4. **统一数据管理** - MessageManager 自动同步，无需手动维护
5. **完善错误处理** - 重试、超时、错误恢复机制
6. **向后兼容** - 保持原有接口，无需修改上层代码

### 📊 架构层次

```
┌─────────────────────────────────────────┐
│  应用层 (useChatSubmitV2)                │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  编排层         │
│  - ConversationOrchestrator              │
│  - 主循环：请求 → 解析 → 工具 → 重复      │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┬─────────────┐
    │          │          │             │
┌───▼────┐ ┌──▼─────┐ ┌──▼──────┐ ┌──▼──────┐
│ 解析层  │ │工具执行 │ │状态管理 │ │传输层   │
│ Parser  │ │Executor│ │Manager  │ │Transport│
└─────────┘ └────────┘ └─────────┘ └─────────┘
```

## 快速开始

### 1. 基本使用（完全兼容旧接口）

```typescript
import { createStreamingV2 } from '@renderer/hooks/chatSubmit/streaming-v2'

// 创建 streaming 实例（与旧接口完全相同）
const sendRequest = createStreamingV2({
  setMessages,
  setShowLoadingIndicator,
  beforeFetch,
  afterFetch
})

// 使用（与旧接口完全相同）
const result = await sendRequest(preparedRequest, {
  onStateChange: (state) => {
    console.log('State changed:', state) // 'streaming' | 'toolCall'
  }
})
```

### 2. 高级配置（使用 V2 特性）

```typescript
import { createStreamingV2 } from '@renderer/hooks/chatSubmit/streaming-v2'

// 创建带配置的 streaming 实例
const sendRequest = createStreamingV2(
  {
    setMessages,
    setShowLoadingIndicator,
    beforeFetch,
    afterFetch
  },
  {
    // V2 配置选项
    maxConcurrency: 5,        // 最大并发工具数（默认 3）
    timeoutConfig: {
      timeout: 60000          // 工具超时 60 秒（默认 30 秒）
    },
    retryConfig: {
      maxRetries: 3,          // 最大重试次数（默认 2）
      initialDelay: 2000,     // 初始重试延迟 2 秒（默认 1 秒）
      backoffFactor: 2,       // 退避因子（默认 2）
      maxDelay: 30000         // 最大重试延迟 30 秒（默认 10 秒）
    }
  }
)
```

## 高级用法

### 直接使用各层组件

如果你需要更多控制，可以直接使用各层组件：

```typescript
import {
  ConversationOrchestrator,
  MessageManager,
  ChunkParser,
  ParallelToolExecutor,
  UnifiedChatTransport
} from '@renderer/hooks/chatSubmit/streaming-v2'

// 1. 创建状态管理器
const messageManager = new MessageManager(
  messageEntities,
  requestMessages,
  setMessages
)

// 2. 创建解析器
const parser = new ChunkParser()

// 3. 创建工具执行器
const toolExecutor = new ParallelToolExecutor({
  maxConcurrency: 5,
  timeoutConfig: { timeout: 60000 },
  retryConfig: { maxRetries: 3 }
})

// 4. 创建传输层
const transport = new UnifiedChatTransport(beforeFetch, afterFetch)

// 5. 创建编排器
const orchestrator = new ConversationOrchestrator(
  preparedRequest,
  { maxConcurrency: 5 },
  { onStateChange: (state) => console.log(state) }
)

// 6. 启动
const result = await orchestrator.start()
```

### 自定义工具执行

```typescript
import { ParallelToolExecutor, withRetry, withTimeout } from '@renderer/hooks/chatSubmit/streaming-v2'

// 创建自定义执行器
const customExecutor = new ParallelToolExecutor({
  maxConcurrency: 10,         // 更高的并发数
  timeoutConfig: {
    timeout: 120000,          // 2 分钟超时
    retryOnTimeout: true      // 超时后重试
  },
  retryConfig: {
    maxRetries: 5,            // 更多重试次数
    initialDelay: 5000,       // 5 秒初始延迟
    backoffFactor: 3,         // 更快的退避
    maxDelay: 60000           // 最大 1 分钟
  }
})

// 使用自定义执行器
const results = await customExecutor.execute(toolCalls)
```

## 迁移指南

### 从旧 streaming.ts 迁移到 streaming-v2.ts

#### 方案 1：直接替换（推荐）

```typescript
// 旧代码
import { createStreamingV2 as createStreamingOld } from './streaming'

// 新代码（只需改导入路径）
import { createStreamingV2 } from './streaming-v2'

// 其余代码完全不变
const sendRequest = createStreamingV2(deps)
```

#### 方案 2：渐进式迁移

```typescript
// 同时保留两个版本，逐步切换
import { createStreamingV2 as createStreamingOld } from './streaming'
import { createStreamingV2 as createStreamingNew } from './streaming-v2'

// 通过配置控制使用哪个版本
const useV2 = true // 可以通过 feature flag 控制

const sendRequest = useV2
  ? createStreamingNew(deps)
  : createStreamingOld(deps)
```

### API 兼容性

#### ✅ 完全兼容的接口

```typescript
// 所有这些接口都完全兼容
type SendRequestStage = (
  context: PreparedRequest,
  callbacks?: StreamingFactoryCallbacks
) => Promise<StreamingContext>

interface StreamingDeps {
  setMessages: (messages: MessageEntity[]) => void
  setShowLoadingIndicator: (state: boolean) => void
  beforeFetch: () => void
  afterFetch: () => void
}

interface StreamingFactoryCallbacks {
  onStateChange: (state: 'streaming' | 'toolCall') => void
}
```

#### ✅ 完全兼容的行为

- 流式响应处理 ✅
- Think tag 解析 ✅
- 工具调用 ✅
- Abort 中断 ✅
- 错误处理 ✅

## 性能对比

### 工具调用性能

| 场景 | 旧实现 (串行) | 新实现 (并行，maxConcurrency=3) | 提升 |
|------|--------------|--------------------------------|------|
| 3 个工具，各耗时 2 秒 | 6 秒 | 2 秒 | **67%** |
| 6 个工具，各耗时 1 秒 | 6 秒 | 2 秒 | **67%** |
| 9 个工具，各耗时 1 秒 | 9 秒 | 3 秒 | **67%** |

### 内存占用

- 新架构的内存占用与旧实现相当
- 使用对象池和复用策略，避免不必要的 GC

## 故障排查

### 问题 1：工具调用超时

**症状**：工具调用在 30 秒后超时

**解决方案**：
```typescript
const sendRequest = createStreamingV2(deps, {
  timeoutConfig: {
    timeout: 60000  // 增加到 60 秒
  }
})
```

### 问题 2：工具调用失败

**症状**：工具调用偶尔失败，但没有重试

**解决方案**：
```typescript
const sendRequest = createStreamingV2(deps, {
  retryConfig: {
    maxRetries: 5,        // 增加重试次数
    initialDelay: 2000    // 增加初始延迟
  }
})
```

### 问题 3：并发工具过多

**症状**：同时发起太多工具调用，系统负载过高

**解决方案**：
```typescript
const sendRequest = createStreamingV2(deps, {
  maxConcurrency: 2  // 降低并发数
})
```

## 测试

### 单元测试示例

```typescript
import { ChunkParser } from '@renderer/hooks/chatSubmit/streaming-v2'
import type { StreamingState } from '@renderer/hooks/chatSubmit/types'

describe('ChunkParser', () => {
  it('should parse think tags correctly', () => {
    const parser = new ChunkParser()
    const state: StreamingState = {
      gatherContent: '',
      gatherReasoning: '',
      isContentHasThinkTag: false,
      tools: { hasToolCall: false, toolCalls: [] }
    }

    const result = parser.parse(
      {
        content: 'Let me think...</think>'
      },
      state
    )

    expect(result.reasoningDelta).toBe('Let me think...')
    expect(result.hasThinkTag).toBe(true)
  })
})
```

### 集成测试示例

```typescript
import { createStreamingV2 } from '@renderer/hooks/chatSubmit/streaming-v2'

describe('Streaming V2 Integration', () => {
  it('should handle tool calls in parallel', async () => {
    const sendRequest = createStreamingV2(deps, {
      maxConcurrency: 3
    })

    const result = await sendRequest(preparedRequest)

    expect(result.streaming.tools.toolCalls).toHaveLength(3)
    expect(result.streaming.tools.toolCallResults).toHaveLength(3)
  })
})
```

## 最佳实践

### 1. 选择合适的并发数

```typescript
// CPU 密集型工具：降低并发数
const sendRequest = createStreamingV2(deps, {
  maxConcurrency: 2
})

// I/O 密集型工具：提高并发数
const sendRequest = createStreamingV2(deps, {
  maxConcurrency: 5
})
```

### 2. 设置合理的超时时间

```typescript
// 根据工具特性设置超时
const sendRequest = createStreamingV2(deps, {
  timeoutConfig: {
    timeout: 60000  // 大多数工具在 60 秒内完成
  }
})
```

### 3. 配置重试策略

```typescript
// 网络不稳定环境：增加重试
const sendRequest = createStreamingV2(deps, {
  retryConfig: {
    maxRetries: 5,
    initialDelay: 2000,
    backoffFactor: 2
  }
})
```

## FAQ

### Q: V2 和旧实现有什么区别？

A:
- **旧实现**：单一类处理所有逻辑，工具串行执行
- **V2 实现**：分层架构，工具并行执行，职责清晰

### Q: 是否必须迁移到 V2？

A: 不必须。V2 完全向后兼容，你可以选择性地使用新特性。

### Q: V2 的性能如何？

A: 在工具调用场景下，性能提升 50%-70%。其他场景性能相当。

### Q: 如何监控工具执行性能？

A: 每个工具执行结果都包含 `cost` 字段（毫秒）：
```typescript
const results = await toolExecutor.execute(toolCalls)
results.forEach(r => {
  console.log(`${r.name}: ${r.cost}ms`)
})
```

## 未来计划

- [ ] 支持流式断点续传
- [ ] 支持工具调用优先级
- [ ] 支持流式缓存
- [ ] 支持多后端切换
- [ ] 支持流式响应的部分重试

## 贡献

欢迎提交 PR 和 Issue！

## 许可证

MIT
