# 消息分段渲染优化方案

## 1. 问题背景

### 1.1 当前实现的问题

**现状：**
- 一次对话只返回一个 `ChatMessage` (assistant 消息)
- 所有的更新（text 内容、toolCallResults）都是对这个单一消息进行状态修改
- 所有 `toolCallResults` 都附加在同一个 assistant 消息上
- 在 `ChatMessageComponent` 中，所有 toolCallResults 都渲染在 content 之前（顶部）

**导致的问题：**
1. **渲染顺序不自然**：所有工具调用结果都堆在顶部，与 LLM 实际的输出顺序不符
2. **性能问题**：多个 ToolCallResult 同时渲染会阻塞主线程，造成输入卡顿
3. **用户体验差**：无法看到 LLM 的真实思考流程（text → tool → text → tool...）

## 2. 优化方案（消息分段方案）

将助手消息分段处理，实现更自然的渲染流程。

### 2.1 核心思想

将一次助手回复从**单个 ChatMessage** 改为 **ChatMessage 片段数组（Segments）**：

[
  { type: 'reasoning', content: 'thinking about the problem...' },
  { type: 'text', content: 'the problem is...' },
  { type: 'toolCall', name: 'read_file', content: {...} },
  { type: 'text', content: 'based on the file content...' },
  { type: 'toolCall', name: 'grep', content: {...} },
  { type: 'text', content: 'here is the final answer...' }
]
```

### 2.2 实现策略

#### 策略 MessageSegment 完全重构为 segment 数组

**优势：**
- 数据结构更清晰
- 更容易实现流式分段渲染

**实现方式：**
```typescript
interface AssistantMessage {
  role: 'assistant'
  model: string
  segments: MessageSegment[]  // 核心：片段数组
  reasoning?: string
  artifacts?: any
}
```

## 3. 详细实施步骤

### 3.1 类型定义修改

**文件：** `src/types/index.d.ts` 或相关类型定义文件

```typescript
// 1. 定义消息片段类型
type MessageSegment = TextSegment | ToolCallSegment

interface ReasoningSegment {
  type: 'reasoning'
  content: string
  timestamp: number  // 用于排序
}

interface TextSegment {
  type: 'text'
  content: string
  timestamp: number  // 用于排序
}

interface ToolCallSegment {
  type: 'toolCall'
  name: string
  content: any
  cost?: number
  isError?: boolean
  timestamp: number
}

// 2. 扩展 ChatMessage 接口
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content?: string | VLMContent[]

  // 新增字段
  segments?: MessageSegment[]

  // 其他字段...
  model?: string
  reasoning?: string
  artifacts?: any
  toolCalls?: any[]
  typewriterCompleted?: boolean
}
```

### 3.2 修改消息组装逻辑

**文件：** `src/renderer/src/hooks/useChatSubmit.tsx`

#### 修改点 1：初始化 segments 数组

```typescript
// Line 188-197
const initialAssistantMessage: MessageEntity = {
  body: {
    role: 'assistant',
    model: model.name,
    content: '',
    segments: [],  // 新增：初始化 segments 数组
  }
}
```

#### 修改点 2：流式响应处理 - 累积 text 片段

#### 添加 text 片段

#### 添加 toolCall 片段

### 3.3 修改渲染逻辑

**文件：** `src/renderer/src/components/chat/ChatMessageComponent.tsx`

#### 优先使用 segments 渲染

## 性能优化

### 虚拟滚动（未来优化）

如果单个消息的 segments 非常多（例如 50+ 个工具调用）：
- 考虑实现虚拟滚动
- 只渲染可见区域的 segments
- 使用 `tankstack`

## 总结

本方案通过引入 **segments 数组**，实现了消息的分段渲染，解决了当前 ToolCallResults 堆在顶部的问题。