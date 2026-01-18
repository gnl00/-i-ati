# Streaming Parser 层架构

> Note: Renderer no longer runs streaming orchestration or tool execution. Those live in main; renderer keeps parsers/segment utilities for UI deltas.

## 概述

Parser 层是流式响应解析的核心组件，负责从 LLM 返回的流式数据中提取和分类信息。它是渐进式重构的第一步，将原本混杂在 `handleStreamingChunk` 中的解析逻辑分离到独立的、可测试的模块中。

## 核心问题

### 重构前的问题

原始的 `handleStreamingChunk` 函数承担了过多的职责：
- 解析 Think 标签（跨 chunk 的状态管理）
- 累积 Tool Call 参数
- 合并和创建 Message Segments
- 更新应用状态

这导致代码难以理解、测试和优化。

### 解决方案

通过**责任分离**和**单一职责原则**，将解析逻辑拆分为多个独立的解析器，每个解析器只处理一种特定的内容类型。

---

## 架构设计

### 分层结构

```
┌─────────────────────────────────────────────────┐
│         StreamingSessionMachine                  │
│  - 流程控制                                       │
│  - 状态管理                                       │
└────────────────────┬────────────────────────────┘
                     │ 使用
                     ▼
┌─────────────────────────────────────────────────┐
│              Parser 层                          │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ThinkTagParser│  │ToolCallParser│            │
│  │  状态机解析   │  │  参数累积    │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐            │
│  │SegmentBuilder│  │ ChunkParser  │            │
│  │  智能合并    │  │  协调器      │            │
│  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────┘
```

### 设计原则

1. **单一职责**: 每个解析器只处理一种特定的内容类型
2. **无状态性**: 除了必要的内部状态（如 Think Tag 解析器），解析器应该是无状态的
3. **可组合性**: 多个解析器可以组合使用，通过 `ChunkParser` 协调
4. **可测试性**: 每个解析器可以独立测试，无需 mock 整个上下文

---

## 组件说明

### 1. ChunkParser（主解析器）

**职责**: 协调所有子解析器，提供统一的解析接口

**原理**:
- 接收一个响应 chunk 和当前流式状态
- 按顺序调用子解析器处理不同类型的内容
- 返回统一的 `ParseResult` 对象

**输出**:
- `contentDelta`: 普通文本内容增量
- `reasoningDelta`: 推理内容增量
- `toolCalls`: 累积的工具调用列表
- `hasThinkTag`: 是否检测到 Think 标签
- `isInThinkTag`: 是否当前在 Think 标签内部

---

### 2. ThinkTagParser（Think 标签解析器）

**职责**: 解析 LLM 返回的 `` 标签，处理跨 chunk 的情况

**核心挑战**:
- Think 标签可能跨越多个 chunk（如 `

` 在第一个 chunk，`内容` 在第二个，`</think>` 在第三个）
- 需要维护解析状态来正确识别标签的开始和结束
- Think 标签内的内容应该被识别为"推理内容"，而不是普通文本

**实现原理**:
- 使用**状态机**模式，维护三种状态：
  - `NoThink`: 不在 Think 标签内
  - `InThink`: 正在解析 Think 标签内容
  - `EndThink`: Think 标签已关闭
- 使用缓冲区（`buffer`）来累积跨 chunk 的标签内容
- 每次解析返回：推理内容增量、普通文本增量、当前是否在 Think 标签内

**状态转换图**:
```
NoThink ──[发现 <think>]──> InThink
  │                          │
  │                          ├──>[发现 </think>]──> EndThink ──> NoThink
  │
  └──>[普通内容]──> 返回文本增量
```

---

### 3. ToolCallParser（工具调用解析器）

**职责**: 累积流式响应中的 Tool Call 参数

**核心挑战**:
- LLM 返回的工具调用参数是**分片**的（如 `{"q":` 在第一个 chunk，`"hello"}` 在第二个）
- 需要根据 `index` 或 `id` 将参数片段累积到正确的 Tool Call 上
- 可能同时有多个 Tool Call 在累积

**实现原理**:
- 接收当前 chunk 中的 `toolCalls` 和已累积的 `toolCalls`
- 对于每个新的 tool call 片段：
  - 通过 `index` 或 `id` 查找已存在的 tool call
  - 如果存在，追加参数（`args += newArgs`）
  - 如果不存在，创建新的 tool call 条目
- 返回更新后的完整 tool call 列表

**为什么需要累积**:
LLM 流式返回时，一个 JSON 对象可能被拆分成多个片段：
```
Chunk 1: {"index": 0, "function": {"name": "search", "arguments": "{\"q":"}}
Chunk 2: {"index": 0, "function": {"arguments": "\"hello\"}}
```
需要将这两个片段合并成完整的参数：`{"q": "hello"}`

---

### 4. SegmentBuilder（Segment 构建器）

**职责**: 智能合并和创建 Message Segments

**核心问题**:
- 流式响应会产生大量小片段（如每个字符一个 delta）
- 需要将连续的相同类型片段合并，避免产生过多的 segment 对象
- 相同类型应该合并，不同类型应该创建新 segment

**实现原理**:
- 接收现有的 `segments` 数组、内容 `delta` 和类型 `type`
- 检查最后一个 segment 的类型：
  - **如果类型相同**: 合并内容（`lastSegment.content += delta`）
  - **如果类型不同或不存在**: 创建新 segment
- 自动过滤空白内容（空字符串或纯空格）

**优化效果**:
```
原始: [{type: "text", content: "H"}, {type: "text", content: "e"}, ...]
合并后: [{type: "text", content: "Hello World"}]
```

---

## 数据流

### 输入

```typescript
{
  content: "Some text",          // LLM 返回的文本内容
  reasoning: "Thinking...",      // LLM 返回的推理内容（部分模型支持）
  toolCalls: [...]               // LLM 返回的工具调用片段
}
```

### 处理流程

```
1. ChunkParser 接收 chunk
   ↓
2. ThinkTagParser 检测和解析 Think 标签
   → 提取出: reasoningDelta, textDelta
   ↓
3. ToolCallParser 累积工具调用参数
   → 更新: toolCalls 列表
   ↓
4. 返回统一的 ParseResult
   ↓
5. 应用解析结果
   → SegmentBuilder 智能合并 segments
   → 更新应用状态
```

### 输出

```typescript
{
  contentDelta: "Some text",          // 普通文本增量
  reasoningDelta: "Thinking...",      // 推理内容增量
  toolCalls: [...],                   // 累积的工具调用
  hasThinkTag: false,                 // 是否有 Think 标签
  isInThinkTag: false                 // 是否在 Think 标签内
}
```

---

## 使用方式

### 基本使用

1. 创建 `ChunkParser` 实例
2. 在流式循环中，对每个 chunk 调用 `parser.parse(chunk, currentState)`
3. 根据 `ParseResult` 更新应用状态和 UI

### 与 StreamingSessionMachine 集成

`ChunkParser` 已经集成到 `StreamingSessionMachine` 中，无需手动调用。机器人的主循环会自动：
- 解析每个流式 chunk
- 更新流式状态
- 应用解析结果到消息
- 触发 UI 更新

---

## 优势与收益

### 代码质量
- **代码行数减少 19%**: 从 418 行减少到 337 行
- **函数复杂度降低 72%**: handleStreamingChunk 从 113 行减少到 32 行
- **职责清晰**: 每个解析器只做一件事

### 可维护性
- **易于理解**: 每个解析器的职责明确，代码自解释
- **易于修改**: 修改某个解析逻辑不影响其他部分
- **易于扩展**: 添加新的解析类型（如解析图片、代码块）很简单

### 可测试性
- **独立测试**: 每个解析器可以单独测试
- **快速测试**: 单元测试无需 mock 整个上下文
- **高覆盖率**: 容易达到 >80% 的测试覆盖率

---

## 文件结构

```
streaming/parser/
├── index.ts              # 导出入口
├── types.ts              # 类型定义（ParseResult, ChunkParser 接口）
├── chunk-parser.ts       # 主解析器
├── think-tag-parser.ts   # Think 标签解析器（状态机）
├── tool-call-parser.ts   # Tool Call 累积解析器
└── segment-builder.ts    # Segment 智能构建器
```

---

## 下一步

完成 Parser 层抽取后，可以考虑继续渐进式重构：

### Phase 2: ToolExecutor 层
- 将工具执行逻辑（`handleToolCalls` 函数）抽取到独立的执行器
- 支持并行工具执行（当前是串行）
- 添加重试和超时机制

### Phase 3: MessageManager 层
- 统一状态管理，消除手动同步
- 提供原子更新方法
- 简化状态更新逻辑

### Phase 4: 完全重构为 Orchestrator（可选）
- 如果需要更多功能，可以考虑完全重构为分层架构
- 参考 `streamingObsolete` 的完整实现

---

## 技术细节

### Think 标签解析的关键点

1. **跨 chunk 处理**: 使用状态机 + 缓冲区
2. **状态同步**: 解析器返回 `hasThinkTag`，由调用方更新到 `context.streaming.isContentHasThinkTag`
3. **内容分类**: Think 标签内的内容 → `reasoningDelta`，其他 → `contentDelta`

### Tool Call 累积的关键点

1. **唯一标识**: 使用 `index` 或 `id` 来匹配同一个 Tool Call 的不同片段
2. **参数拼接**: 简单的字符串拼接（`args += newArgs`）
3. **列表管理**: 返回完整的、更新后的 tool call 列表

### Segment 合并的关键点

1. **类型判断**: 只有相同类型才合并
2. **内容过滤**: 忽略空白内容
3. **不可变更新**: 使用展开运算符创建新数组，而不是修改原数组

---

## 总结

Parser 层通过**职责分离**和**单一职责原则**，将复杂的流式解析逻辑拆分为多个独立的、可测试的模块。这不仅提高了代码质量，还为后续的重构和优化铺平了道路。

核心思想：**让每个组件只做一件事，并做好这件事**。
