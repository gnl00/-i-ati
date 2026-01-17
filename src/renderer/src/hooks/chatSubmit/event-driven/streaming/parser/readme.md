Parser 层抽取：渐进式重构计划

目标

将 streaming.ts 中的消息解析逻辑抽取到独立的 Parser 层，作为渐进式重构的第一步。

背景

当前问题

handleStreamingChunk 函数（34-146行）包含多种职责混杂：
- Tool calls 累积（43-64行）
- Think tag 解析状态机（66-93行）
- Segment 合并逻辑（104-140行）
- 消息状态更新（142-145行）

资源

streamingObsolete/ 目录下已有完整的 Parser 层实现，可作为参考和基础。

架构设计

分离前后的职责对比

重构前:
┌─────────────────────────────────────────────────────────┐
│           StreamingSessionMachine                       │
│  ├─ handleStreamingChunk()  [113行，职责混杂]          │
│  │  ├─ Tool call 累积                                  │
│  │  ├─ Think tag 解析                                  │
│  │  ├─ Segment 合并                                    │
│  │  └─ 状态更新                                        │
│  └─ handleToolCalls()                                  │
└─────────────────────────────────────────────────────────┘

重构后:
┌─────────────────────────────────────────────────────────┐
│           StreamingSessionMachine                       │
│  ├─ handleStreamingChunk()  [~15行，协调调用]          │
│  │  └─ 调用 Parser 层                                  │
│  └─ handleToolCalls()                                  │
└──────────────────────┬──────────────────────────────────┘
                      │ 使用
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  Parser 层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ThinkTagParser│  │ToolCallParser│  │SegmentBuilder│ │
│  │  [20行]      │  │  [30行]      │  │  [20行]      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐                                      │
│  │ ChunkParser  │ ← 协调所有解析器 [~60行]            │
│  └──────────────┘                                      │
└─────────────────────────────────────────────────────────┘

Parser 层接口定义

// 主解析器接口
interface ChunkParser {
  parse(chunk: IUnifiedResponse, currentState: StreamingState): ParseResult
}

// 解析结果
interface ParseResult {
  contentDelta: string          // 普通文本增量
  reasoningDelta: string        // 推理内容增量
  toolCalls: ToolCallProps[]    // 累积的 tool calls（返回完整列表）
  hasThinkTag: boolean          // 是否检测到 think tag
  isInThinkTag: boolean         // 是否在 think tag 内
}

// Segment 构建器
interface SegmentBuilder {
  appendSegment(
    segments: MessageSegment[],
    delta: string,
    type: 'text' | 'reasoning'
  ): MessageSegment[]
}

实施步骤

Step 1: 创建 Parser 层文件结构

目标文件:
src/renderer/src/hooks/chatSubmit/v2/parser/
├── index.ts                  # 导出所有 parser 组件
├── types.ts                  # Parser 层专用类型定义
├── chunk-parser.ts           # 主解析器，协调子解析器
├── think-tag-parser.ts       # Think tag 解析器
├── tool-call-parser.ts       # Tool call 累积解析器
└── segment-builder.ts        # Segment 智能构建器


---
Step 2: 修改 streaming.ts 引入 Parser 层

---
Step 3: 重构 handleStreamingChunk 函数

重构后的实现:

// 新增辅助函数：应用解析结果到消息
const applyParseResult = (
  context: StreamingContext,
  result: ParseResult,
  setMessages: (messages: MessageEntity[]) => void
) => {
  const updatedMessages = [...context.session.messageEntities]
  const lastMessage = updatedMessages[updatedMessages.length - 1]

  if (!lastMessage.body.segments) {
    lastMessage.body.segments = []
  }

  const segments = [...lastMessage.body.segments]
  const segmentBuilder = new SegmentBuilder()

  // 应用 reasoning delta
  if (result.reasoningDelta.trim()) {
    segmentBuilder.appendSegment(segments, result.reasoningDelta, 'reasoning')
  }

  // 应用 text delta
  if (result.contentDelta.trim()) {
    segmentBuilder.appendSegment(segments, result.contentDelta, 'text')
  }

  lastMessage.body.segments = segments
  context.session.messageEntities = updatedMessages
  context.session.chatMessages = updatedMessages.map(msg => msg.body)
  setMessages(updatedMessages)
}

// 重构后的 handleStreamingChunk（简化版）
const handleStreamingChunk = (
  context: StreamingContext,
  resp: IUnifiedResponse,
  setMessages: (messages: MessageEntity[]) => void,
  parser: ChunkParser  // ← 新增参数
) => {
  // 1. 使用 Parser 解析 chunk（替代 43-93行）
  const result = parser.parse(resp, context.streaming)

  // 2. 更新流式状态
  context.streaming.tools.toolCalls = result.toolCalls
  context.streaming.tools.hasToolCall = result.toolCalls.length > 0
  context.streaming.isContentHasThinkTag = result.isInThinkTag

  // 3. 应用解析结果（替代 104-145行）
  applyParseResult(context, result, setMessages)
}

---
Step 6: 文档更新

文件: src/renderer/src/hooks/chatSubmit/v2/README.md

内容:

## Streaming V2 - Parser 层架构

### 概述
Parser 层负责解析流式响应中的各种内容类型，将混杂的解析逻辑从 `StreamingSessionMachine`
中分离出来，提高代码的可测试性和可维护性。

### 职责
- **Think Tags 解析**: 检测和解析 `` 标签，处理跨 chunk 的情况
- **Tool Calls 累积**: 累积流式响应中的 tool call 参数
- **Segments 构建**: 智能合并和创建消息片段（text/reasoning）

### 文件结构
parser/
├── index.ts              # 导出所有 parser
├── types.ts              # 类型定义
├── chunk-parser.ts       # 主解析器（协调子解析器）
├── think-tag-parser.ts   # Think tag 解析器
├── tool-call-parser.ts   # Tool call 累积解析器
└── segment-builder.ts    # Segment 智能构建器

### 使用示例

```typescript
import { ChunkParser } from './parser'

// 1. 创建 parser 实例
const parser = new ChunkParser()

// 2. 解析响应 chunk
const result = parser.parse(chunk, currentState)

// 3. 应用解析结果
if (result.reasoningDelta) {
  // 更新 reasoning segment
}

if (result.contentDelta) {
  // 更新 text segment
}

if (result.toolCalls.length > 0) {
  // 处理工具调用
}

// 4. 更新状态
context.streaming.tools.toolCalls = result.toolCalls
context.streaming.isContentHasThinkTag = result.isInThinkTag

类型定义

interface ParseResult {
  contentDelta: string          // 普通文本增量
  reasoningDelta: string        // 推理内容增量
  toolCalls: ToolCallProps[]    // 累积的 tool calls
  hasThinkTag: boolean          // 是否包含 think tag
  isInThinkTag: boolean         // 是否在 think tag 内
}

interface ChunkParser {
  parse(chunk: IUnifiedResponse, currentState: StreamingState): ParseResult
}

interface SegmentBuilder {
  appendSegment(
    segments: MessageSegment[],
    delta: string,
    type: 'text' | 'reasoning'
  ): MessageSegment[]
}

测试

运行单元测试：
bash
npm test -- chunk-parser.test.ts


设计优势

- ✅ 职责单一: 每个 parser 只负责一种解析任务
- ✅ 易于测试: 可独立测试每个解析器
- ✅ 可复用: Parser 层可在其他地方复用
- ✅ 易扩展: 添加新的解析逻辑不影响现有代码

**验收标准**:
- ✅ 文档清晰易懂
- ✅ 包含使用示例和类型定义
- ✅ 说明架构设计和优势

---

## 下一步（可选）

完成 Parser 层抽取后，可以考虑继续渐进式重构：

### Phase 2: 抽取 ToolExecutor 层
- 将 `handleToolCalls` 函数（258-352行）抽取到独立的 ToolExecutor
- 支持并行工具执行（使用 Promise.allSettled）
- 添加重试和超时机制
- **预计时间**: 2-3小时

### Phase 3: 统一状态管理
- 创建 MessageManager 类
- 消除手动同步代码（3次手动更新改为1次）
- 提供原子更新方法
- **预计时间**: 1-2小时

### Phase 4: 完全重构为 Orchestrator（可选）
- 如果需要更多功能，考虑完全重构为分层架构
- 参考 streamingObsolete 的完整实现
- **预计时间**: 1-2天

---

## 关键文件清单

### 需要创建的文件
- `src/renderer/src/hooks/chatSubmit/v2/parser/index.ts`
- `src/renderer/src/hooks/chatSubmit/v2/parser/types.ts`
- `src/renderer/src/hooks/chatSubmit/v2/parser/chunk-parser.ts`
- `src/renderer/src/hooks/chatSubmit/v2/parser/think-tag-parser.ts`
- `src/renderer/src/hooks/chatSubmit/v2/parser/tool-call-parser.ts`
- `src/renderer/src/hooks/chatSubmit/v2/parser/segment-builder.ts`
- `src/renderer/src/hooks/chatSubmit/v2/parser/__tests__/chunk-parser.test.ts`
- `src/renderer/src/hooks/chatSubmit/v2/README.md`

### 需要修改的文件
- `src/renderer/src/hooks/chatSubmit/v2/streaming.ts`

### 参考文件（不修改）
- `src/renderer/src/hooks/chatSubmit/v2/streamingObsolete/parser/*` - 已有的 Parser 实现

---

## 风险和缓解

### 风险 1: Think Tag 解析状态不一致
**描述**: Parser 内部状态与 StreamingState 不同步

**缓解措施**:
- Parser 是无状态的（除了 ThinkTagParser 的 buffer）
- 每次 parse 调用都返回最新的 hasThinkTag/isInThinkTag
- streaming.ts 负责更新 context.streaming.isContentHasThinkTag

### 风险 2: Segment 合并逻辑差异
**描述**: 新的 SegmentBuilder 与旧逻辑行为不一致

**缓解措施**:
- 仔细对比旧代码（104-140行）与 SegmentBuilder 实现
- 编写详细的单元测试覆盖各种情况
- 集成测试验证完全一致性

### 风险 3: Tool Call 累积逻辑错误
**描述**: index 或 id 匹配逻辑有 bug

**缓解措施**:
- ToolCallParser 代码直接从 streamingObsolete 迁移（已验证）
- 单元测试覆盖累积、更新、创建新 call 等场景

### 风险 4: 性能回退
**描述**: 抽取层后性能下降

**缓解措施**:
- Parser 层无额外开销（纯函数，无副作用）
- 对象创建数量与旧实现相同
- 性能测试验证无显著差异

---
总结

这个渐进式重构计划将 handleStreamingChunk 函数的复杂性降低 80%：

| 指标     | 重构前                       | 重构后                    | 改进   |
|----------|------------------------------|---------------------------|--------|
| 代码行数 | 113 行                       | 40 行                     | ↓ 65%  |
| 职责数量 | 4 个（混杂）                 | 1 个（协调）              | ↓ 75%  |
| 可测试性 | 低（需要 mock 整个 context） | 高（独立测试 parser）     | ↑ 显著 |
| 代码重复 | 高（segment 合并重复）       | 无（SegmentBuilder 复用） | ↓ 100% |

Parser 层可以独立测试、独立优化，为后续重构铺平道路。整个重构过程预计 2 小时，风险低，收益高。