# Chat Submit Pipeline

该目录将 `useChatSubmit` 的关键数据流拆成多个阶段，方便排查和扩展。下面用步骤说明一次聊天请求从输入到持久化的完整路径。

## 1. prepareMessageAndChat (`prepare.ts`)
- 读取用户输入 (`input`)、当前会话元数据 (`chat`) 和 Store 状态 (`store`)。
- 构建 `userMessageEntity` 并保存到数据库，同时确保聊天记录、workspace 等信息存在。
- 立即插入一条空的 assistant 消息以便 UI 显示模型徽章。
- 产出 `PreparedChat`：封装 `input + session + control + meta`，让后续阶段显式依赖所需数据。

## 2. buildRequest (`request.ts`)
- 根据 workspace prompt 和可选的自定义 prompt 组装最终的 system prompt。
- 过滤掉无内容的占位 assistant 消息，保留 tool call 历史。
- 收集 embedded tools + 额外 tools，生成 LLM 请求体 (`context.request`)。

## 3. Streaming 管道 (`streaming/index.ts`)
### 3.1 processRequest
- 调用 `unifiedChatRequest` 读取流式响应。
- 针对每个 chunk：
  - 累积 reasoning / text 内容，实时切分为 segments。
  - 监控 `<think>` 标签，确保 reasoning 与 text 在 UI 中分离。
  - 发现 `toolCalls` 时缓存在 `context.toolCalls`，并保证同一个 toolCall 的增量参数被拼接。
- 如果响应中包含 tool call：
  - 将当前的 assistant 消息转换为带 `toolCalls` 的版本，并把该消息追加到 request.messages 中，形成 "assistant/tool/tool-result" 循环。

### 3.2 handleToolCall
- 逐个执行 `context.toolCalls`：
  - 优先触发 embedded tool，否则走 MCP 调用。
  - 将工具结果以 `toolCall` segment 形式写回当前 assistant 消息。
  - 构造 `tool` 角色消息追加到 request.messages，供模型继续对话。
  - 如果工具抛错，仍然保持 UI 的 segments 有一致状态。
- 处理完一轮工具调用后递归回到 `processRequest`，直到没有新的 tool call。
- 任意阶段成功完成后会把 `setShowLoadingIndicator(false)` 交给最外层控制。

## 4. finalizePipeline (`finalize.ts`)
- 负责统一的收尾动作：
  - 更新 `setLastMsgStatus`、`setReadStreamState` 等 Store 状态。
  - 根据配置触发标题生成（默认取前 30 个字符，或调用 `generateTitle`）。
  - 将最终的 assistant 消息（包含 segments 和 `typewriterCompleted` 状态）持久化到数据库，并刷新聊天列表。

## 总结
整个数据流围绕 `PreparedChat → RequestReadyChat → StreamingContext` 的演进展开：
```
prepareMessageAndChat → buildRequest → StreamingPipeline(processRequest ↔ handleToolCall) → finalizePipeline
```
每个阶段只输出下一阶段真正需要的数据，排查问题时只需定位到对应阶段即可。内部的 Pipeline Builder 会聚合阶段结果，并对外暴露“当前最新上下文”，确保状态机订阅者始终看到最新状态。

---

## 当前状态机与数据流总结（中文）

### 状态机结构
- 状态：`idle → preparing → streaming ↔ toolCall → finalizing → completed/error/cancelled`
- `ChatPipelineMachine` 负责状态跳转，并通过 `subscribe` 暴露快照
- 取消：`cancel()` 会调用当前 `controller.abort()` 并进入 `cancelled`

### 数据流步骤
1. `start()` → `preparing`：调用 `prepareMessageAndChat` 保存用户消息、创建上下文。
2. `buildRequest`：基于 workspace prompt + 自定义 prompt 构建请求体，并过滤占位消息。
3. `streaming`：
   - `processRequest` 处理流式 chunk，实时生成 reasoning/text segments。
   - 若检测到 tool call，请求进入 `toolCall` 状态，`handleToolCall` 按顺序调度工具并把结果写回 segments。
   - 工具执行完毕后回到 `streaming`，继续监听 LLM 输出。
4. `finalizing`：`finalizePipeline` 更新 Store 状态、持久化消息、生成标题。
5. 完成或异常时进入 `completed` / `error` / `cancelled`，快照中附带 context 和错误信息，便于 UI 或日志消费。

### 订阅机制
- 任意模块可使用 `machine.subscribe(listener)` 获取状态更新，未来可在此挂载日志、Telemetry 或 UI Loading。
