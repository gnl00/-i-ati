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

### 1.2 已完成的优化（方案 A）

我们已经实现了**渐进式渲染（Progressive Rendering）**：
- 在 `ChatMessageComponent` 中添加了 `visibleToolCalls` 状态
- ToolCallResults 按顺序逐个渲染，每个间隔 100ms
- 有效缓解了同时渲染多个 ToolCallResult 造成的卡顿

**方案 A 的局限性：**
- 只是延迟渲染，无法改变渲染顺序
- toolCallResults 仍然全部出现在 content 之前
- 无法反映 LLM 的真实输出流程

## 2. 优化方案（消息分段方案）

### 2.1 核心思想

将一次助手回复从**单个 ChatMessage** 改为 **ChatMessage 片段数组（Segments）**：

```typescript
// 当前结构
{
  role: 'assistant',
  content: 'full text content',
  toolCallResults: [tc1, tc2, tc3],  // 所有工具调用都在这里
  model: 'model-name'
}

// 新结构（概念）
[
  { type: 'text', content: 'thinking about the problem...' },
  { type: 'toolCall', name: 'read_file', content: {...} },
  { type: 'text', content: 'based on the file content...' },
  { type: 'toolCall', name: 'grep', content: {...} },
  { type: 'text', content: 'here is the final answer...' }
]
```

### 2.2 实现策略

#### 策略 1：扩展 ChatMessage 结构（推荐）

**优势：**
- 向后兼容现有数据结构
- 最小化代码改动
- 保持类型系统稳定

**实现方式：**
```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content?: string | VLMContent[]

  // 保留旧字段用于向后兼容
  toolCallResults?: ToolCallResult[]

  // 新增：消息片段数组
  segments?: MessageSegment[]

  // 其他字段...
  model?: string
  reasoning?: string
  artifacts?: any
}

// 消息片段类型
type MessageSegment = TextSegment | ToolCallSegment

interface TextSegment {
  type: 'text'
  content: string
  timestamp: number
}

interface ToolCallSegment {
  type: 'toolCall'
  name: string
  content: any
  cost?: number
  isError?: boolean
  timestamp: number
}
```

#### 策略 2：完全重构为片段数组（激进）

**优势：**
- 数据结构更清晰
- 更容易实现流式分段渲染

**劣势：**
- 需要大量重构现有代码
- 破坏向后兼容性
- 需要迁移历史数据

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

### 2.3 推荐方案：策略 1（渐进式迁移）

采用**向后兼容的扩展方式**：
1. 新增 `segments` 字段，与 `toolCallResults` 并存
2. 渲染时优先使用 `segments`，如果不存在则回退到旧逻辑
3. 逐步迁移，不影响历史消息

## 3. 详细实施步骤

### 3.1 类型定义修改

**文件：** `src/types/global.d.ts` 或相关类型定义文件

```typescript
// 1. 定义消息片段类型
type MessageSegment = TextSegment | ToolCallSegment

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

  // 保留旧字段（向后兼容）
  toolCallResults?: ToolCallResult[]

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
    artifacts: artifacts
  }
}
```

#### 修改点 2：流式响应处理 - 累积 text 片段

```typescript
// Line 308-378, processRequestV2 函数中
for await (const chunk of response) {
  // ... 现有的 toolCalls 处理逻辑 ...

  // 处理文本内容
  if (!context.isContentHasThinkTag) {
    if (context.gatherContent.includes('<think>')) {
      context.isContentHasThinkTag = true
      if (resp.content) {
        context.gatherContent = resp.content
      }
    } else if (resp.content) {
      context.gatherContent += resp.content
    } else if (resp.reasoning) {
      context.gatherReasoning += resp.reasoning || ''
    }
  }

  // 更新消息时，保持 segments 不变（text 片段会在 toolCall 时添加）
  const updatedMessages = [...context.messageEntities]
  const currentBody = updatedMessages[updatedMessages.length - 1].body

  updatedMessages[updatedMessages.length - 1] = {
    body: {
      ...currentBody,
      content: context.gatherContent,
      reasoning: context.gatherReasoning,
      // segments 在这里不更新，等待 toolCall 时再添加
    }
  }
  setMessages(updatedMessages)
}
```

#### 修改点 3：添加 text 片段（工具调用前）

在 `processRequestV2` 函数的工具调用检测部分（Line 387-401）：

```typescript
// Step 1: 如果有 tool calls，添加 assistant 的 tool_calls 消息到请求历史
if (context.hasToolCall && context.toolCalls.length > 0) {
  // 新增：在工具调用前，将当前的 text 内容保存为一个 segment
  const currentMessages = useChatStore.getState().messages
  const lastMessage = currentMessages[currentMessages.length - 1]

  if (!lastMessage.body.segments) {
    lastMessage.body.segments = []
  }

  // 如果当前有文本内容，添加为 text segment
  if (context.gatherContent && context.gatherContent.trim()) {
    lastMessage.body.segments.push({
      type: 'text',
      content: context.gatherContent,
      timestamp: Date.now()
    })

    // 清空 gatherContent，准备收集下一段文本
    context.gatherContent = ''
  }

  const assistantToolCallMessage: ChatMessage = {
    role: 'assistant',
    content: context.gatherContent || '',
    toolCalls: context.toolCalls.map(tc => ({
      id: tc.id || `call_${uuidv4()}`,
      type: 'function',
      function: {
        name: tc.function,
        arguments: tc.args
      }
    }))
  }
  context.request.messages.push(assistantToolCallMessage)
}
```

#### 修改点 4：添加 toolCall 片段（工具调用后）

在 `handleToolCall` 函数中（Line 434-535）：

```typescript
// Line 469-491, 工具调用结果处理部分
const toolCallSegment: ToolCallSegment = {
  type: 'toolCall',
  name: toolCall.function,
  content: results,
  cost: timeCosts,
  timestamp: Date.now()
}

// 添加到 segments 数组
if (!context.toolCallResults) {
  context.toolCallResults = [{
    name: toolCall.function,
    content: results,
    cost: timeCosts
  }]
} else {
  context.toolCallResults.push({
    name: toolCall.function,
    content: results,
    cost: timeCosts
  })
}

// 更新最后一个消息（assistant 消息）
const updatedMessages = [...context.messageEntities]
const currentBody = updatedMessages[updatedMessages.length - 1].body

// 确保 segments 数组存在
if (!currentBody.segments) {
  currentBody.segments = []
}

// 添加 toolCall segment
currentBody.segments.push(toolCallSegment)

updatedMessages[updatedMessages.length - 1] = {
  body: {
    ...currentBody,
    content: context.gatherContent,
    reasoning: context.gatherReasoning,
    artifacts: artifacts,
    toolCallResults: context.toolCallResults,  // 保留旧字段
    segments: currentBody.segments,  // 新字段
    model: context.model.name
  }
}
setMessages(updatedMessages)
```

#### 修改点 5：添加最后的 text 片段（对话结束时）

在 `processRequestWithToolCall` 函数结束时（Line 538-552）：

```typescript
const processRequestWithToolCall = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
  // 处理流式响应
  context = await processRequestV2(context)

  // 如果有工具调用，处理工具调用后继续处理响应
  if (context.hasToolCall && context.toolCalls.length > 0) {
    context = await handleToolCall(context)
    // 递归调用，处理工具调用后的响应
    return await processRequestWithToolCall(context)
  } else {
    setShowLoadingIndicator(false)

    // 新增：对话结束，添加最后的 text segment
    if (context.gatherContent && context.gatherContent.trim()) {
      const currentMessages = useChatStore.getState().messages
      const lastMessage = currentMessages[currentMessages.length - 1]

      if (!lastMessage.body.segments) {
        lastMessage.body.segments = []
      }

      lastMessage.body.segments.push({
        type: 'text',
        content: context.gatherContent,
        timestamp: Date.now()
      })

      // 触发最后一次状态更新
      setMessages([...currentMessages])
    }
  }

  return context
}
```

### 3.3 修改渲染逻辑

**文件：** `src/renderer/src/components/chat/ChatMessageComponent.tsx`

#### 修改 1：优先使用 segments 渲染

```typescript
// Line 259-343, assistant 消息渲染部分
return (m) ? (
  <div
    id='assistant-message'
    onMouseEnter={_ => onMouseHoverAssistantMsg(true)}
    onMouseLeave={_ => onMouseHoverAssistantMsg(false)}
    className={cn(
      "flex justify-start flex-col",
      index === 0 ? 'mt-2' : '',
      isLatest && "animate-assistant-message-in"
    )}
  >
    <div className="overflow-y-scroll">
      {/* Model badge */}
      {m.model && (
        <Badge id='model-badge' variant="outline" className={cn('select-none text-gray-700 dark:text-gray-300 mb-1 dark:border-white/20', showLoadingIndicator && isLatest ? 'animate-shine-infinite' : '')}>@{m.model}</Badge>
      )}

      {/* Reasoning */}
      {m.reasoning && !m.artifacts && (
        <Accordion defaultValue={'reasoning-' + index} type="single" collapsible className='pl-0.5 pr-0.5 rounded-xl'>
          {/* ... reasoning 渲染逻辑不变 ... */}
        </Accordion>
      )}

      {/* 核心修改：根据是否有 segments 决定渲染方式 */}
      {m.segments && m.segments.length > 0 ? (
        // 新逻辑：按 segments 顺序渲染
        <>
          {m.segments.map((segment, segIdx) => {
            if (segment.type === 'text') {
              return (
                <ReactMarkdown
                  key={`segment-text-${segIdx}`}
                  remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
                  rehypePlugins={[rehypeRaw, rehypeKatex]}
                  skipHtml={false}
                  remarkRehypeOptions={{ passThrough: ['link'] }}
                  className="prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
                  components={markdownCodeComponent}
                >
                  {segment.content}
                </ReactMarkdown>
              )
            } else if (segment.type === 'toolCall') {
              return (
                <ToolCallResult
                  key={`segment-tool-${segIdx}`}
                  toolCall={segment}
                  index={index}
                  isDarkMode={isDarkMode}
                />
              )
            }
            return null
          })}
        </>
      ) : (
        // 旧逻辑：向后兼容，按原方式渲染
        <>
          {/* 先渲染所有 toolCallResults */}
          {m.toolCallResults && m.toolCallResults.length > 0 && m.toolCallResults.slice(0, visibleToolCalls).map((tc, idx) => (
            <ToolCallResult
              key={index + '-' + idx}
              toolCall={tc}
              index={index}
              isDarkMode={isDarkMode}
            />
          ))}

          {/* 再渲染 content */}
          {m.content && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
              skipHtml={false}
              remarkRehypeOptions={{ passThrough: ['link'] }}
              className="prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
              components={markdownCodeComponent}
            >
              {assistantContent}
            </ReactMarkdown>
          )}
        </>
      )}
    </div>

    {/* 操作按钮 */}
    <div id="assistant-message-operation" className={cn(/* ... */)}>
      {/* ... */}
    </div>
  </div>
) : null
```

#### 修改 2：保留渐进式渲染（可选）

如果使用 segments，可以保留渐进式渲染逻辑：

```typescript
// 在组件顶部添加
const [visibleSegments, setVisibleSegments] = useState<number>(0)

// Progressive rendering for segments
useEffect(() => {
  const segmentCount = m.segments?.length || 0
  if (visibleSegments >= segmentCount) return

  const timer = setTimeout(() => {
    setVisibleSegments(prev => prev + 1)
  }, 100)

  return () => clearTimeout(timer)
}, [visibleSegments, m.segments])

// 渲染时使用
{m.segments && m.segments.length > 0 && m.segments.slice(0, visibleSegments).map((segment, segIdx) => {
  // ... 渲染逻辑
})}
```

### 3.4 修改 ToolCallResult 组件（适配新数据结构）

**文件：** `src/renderer/src/components/chat/ToolCallResult.tsx`

```typescript
interface ToolCallResultProps {
  toolCall: ToolCallResult | ToolCallSegment  // 支持两种类型
  index: number
  isDarkMode: boolean
}

export const ToolCallResult: React.FC<ToolCallResultProps> = React.memo(({ toolCall: tc, index, isDarkMode }) => {
  // ... 其他逻辑不变

  // 兼容两种数据结构
  const isWebSearch = tc.name === 'web_search'
  const webSearchData = isWebSearch && tc.content?.results ? tc.content : null

  // ... 其余逻辑保持不变
})
```

## 4. 数据迁移策略

### 4.1 向后兼容

- 历史消息没有 `segments` 字段，使用旧的 `toolCallResults` + `content` 渲染
- 新消息使用 `segments` 渲染
- 两种方式共存，不破坏历史数据

### 4.2 可选：批量迁移（低优先级）

如果需要统一数据格式，可以编写迁移脚本：

```typescript
async function migrateMessagesToSegments() {
  const allChats = await getAllChats()

  for (const chat of allChats) {
    for (const msgId of chat.messages) {
      const message = await getMessageById(msgId)

      if (message.body.role === 'assistant' && !message.body.segments) {
        const segments: MessageSegment[] = []

        // 添加 toolCallResults
        if (message.body.toolCallResults) {
          message.body.toolCallResults.forEach(tc => {
            segments.push({
              type: 'toolCall',
              name: tc.name,
              content: tc.content,
              cost: tc.cost,
              timestamp: Date.now()
            })
          })
        }

        // 添加 content
        if (message.body.content) {
          segments.push({
            type: 'text',
            content: message.body.content,
            timestamp: Date.now()
          })
        }

        // 更新消息
        message.body.segments = segments
        await updateMessage(message)
      }
    }
  }
}
```

## 5. 性能优化

### 5.1 保留渐进式渲染

即使使用 segments，也应保留方案 A 的渐进式渲染：
- segments 按顺序逐个显示
- 每个 segment 间隔 100ms
- 避免同时渲染大量内容

### 5.2 虚拟滚动（未来优化）

如果单个消息的 segments 非常多（例如 50+ 个工具调用）：
- 考虑实现虚拟滚动
- 只渲染可见区域的 segments
- 使用 `react-window` 或 `react-virtuoso`

## 6. 测试计划

### 6.1 单元测试

- [ ] 测试 segments 数组的正确构建
- [ ] 测试 text → toolCall → text 的顺序
- [ ] 测试向后兼容性（无 segments 的旧消息）

### 6.2 集成测试

- [ ] 测试单个工具调用场景
- [ ] 测试多个工具调用场景（3+ 个）
- [ ] 测试嵌套工具调用（tool → tool → text）
- [ ] 测试中断场景（用户取消请求）

### 6.3 性能测试

- [ ] 对比优化前后的渲染性能
- [ ] 测试 10+ segments 的场景
- [ ] 测试输入卡顿情况

## 7. 实施时间线

### Phase 1: 类型定义和数据结构（1-2 小时）
- [ ] 定义 `MessageSegment` 相关类型
- [ ] 扩展 `ChatMessage` 接口

### Phase 2: 消息组装逻辑（3-4 小时）
- [ ] 修改 `prepareMessageAndChat` 初始化逻辑
- [ ] 修改 `processRequestV2` 流式处理逻辑
- [ ] 修改 `handleToolCall` 工具调用逻辑
- [ ] 添加片段添加逻辑

### Phase 3: 渲染逻辑（2-3 小时）
- [ ] 修改 `ChatMessageComponent` 渲染逻辑
- [ ] 适配 `ToolCallResult` 组件
- [ ] 实现向后兼容

### Phase 4: 测试和调优（2-3 小时）
- [ ] 功能测试
- [ ] 性能测试
- [ ] Bug 修复

**预计总时间：8-12 小时**

## 8. 风险和注意事项

### 8.1 数据一致性

- 确保 `segments` 和旧字段（`content`, `toolCallResults`）保持同步
- 避免出现数据不一致的情况

### 8.2 性能风险

- segments 数组可能很大，注意内存占用
- 渲染大量 segments 时注意性能

### 8.3 类型安全

- 确保 TypeScript 类型定义完整
- 避免运行时类型错误

## 9. 后续优化方向

1. **流式分段显示**：不等工具调用完成，边执行边显示
2. **折叠长内容**：超长的 text segment 支持折叠
3. **segment 级别的操作**：支持复制单个 segment
4. **segment 统计**：显示总耗时、token 使用等

## 10. 总结

本方案通过引入 **segments 数组**，实现了消息的分段渲染，解决了当前 ToolCallResults 堆在顶部的问题。关键优势：

1. ✅ **自然的顺序**：按 LLM 真实输出顺序显示
2. ✅ **更好的性能**：配合渐进式渲染，避免同时渲染大量内容
3. ✅ **向后兼容**：不破坏历史数据
4. ✅ **可扩展性**：为未来的流式分段显示打下基础

**建议：** 先实现核心功能，测试稳定后再考虑数据迁移和高级优化。
