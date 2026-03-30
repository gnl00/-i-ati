# Telegram Run Responder Streaming Summary

> 这份文档记录的是 2026-03-27 这一轮 Telegram 流式回复接入的设计与实现总结。
> 它建立在既有 `chatRun` 主链路之上，目标不是给 Telegram 单独补一个“最终回复回发”逻辑，而是让 Telegram 成为共享 run 事件流的一个消费者。

## 背景

在这轮改造前，Telegram 入口虽然已经把请求以 `stream: true` 送入统一 chat runtime，但 Telegram 自身并没有消费流式中间态。

实际行为是：

1. `TelegramGatewayService` 调 `ChatRunService.execute(...)`
2. 等整个 run 完成
3. 从数据库读取最终 assistant message
4. 重新提取文本
5. 再 `sendMessage(...)` 一次性回发

这条路径的问题不是“能不能发出回复”，而是它和 Chat UI 的 runtime 语义不一致：

- Chat UI 的流式文本来自 main 内部 `message.updated`
- Telegram 的文本来自 run 结束后的二次重建
- Telegram 因此没有复用共享 run event 协议

## 设计目标

这轮改造的目标是让 Telegram 回复链路和 Chat UI 在语义上保持一致：

- `agentCore` 仍只负责 parser / step loop / tools / artifacts
- `chatRun` 仍负责 run orchestration 和共享事件发射
- `hostAdapters/chat` 仍负责 assistant message 持久化与事件映射
- Telegram 不再重建最终回复，而是消费共享 run 事件

也就是说，Telegram 要复用的是：

1. assistant placeholder
2. `AgentStepLoop`
3. `AssistantStepMessageManager`
4. `message.updated`
5. `run.completed`

而不是额外创建一条平行的 chunk 处理链。

## 为什么没有把 handler 放进 parser

讨论过程中有一个候选方案是：

- 定义统一的 response handler
- 在 `chunk-parser.ts` 内直接回调这个 handler

这轮没有采用这个方案，原因是：

1. `chunk-parser` 当前职责非常纯，只负责：
   - 输入 `IUnifiedResponse`
   - 输出 `ParseResult`
   - 维护 parser state
2. 如果在 parser 内直接回调宿主 handler，`agentCore` 会开始感知宿主侧副作用
3. 这会让 parser 从“纯解析器”变成“解析 + host projection”混合层，破坏当前分层

当前正确的流式边界不是 raw chunk，而是已经投影成 assistant message 的共享事件：

- `message.updated`
- `run.state.changed`
- `run.completed`
- `run.failed`
- `run.aborted`

## 最终方案

最终收敛方案分成两层：

### 1. `ChatRunEventSink`

在 `chatRun` 基础设施层增加可选 sink 机制：

- 文件：
  - [event-emitter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/infrastructure/event-emitter.ts)
  - [RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunManager.ts)
  - [index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/index.ts)

现有 `ChatRunEventEmitter.emit(...)` 的行为保持不变：

- 继续存 trace DB
- 继续向主窗口发 IPC

新增的是：

- 允许附加本地 `eventSinks`
- 每次 emit 时同步 fan-out 给 sinks

这样 Telegram、未来 terminal、workflow 等宿主都可以消费同一条 run event 流，而不需要自己重建 runtime。

### 2. `TelegramRunResponder`

新增文件：

- [TelegramRunResponder.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramRunResponder.ts)

它的职责不是“解释 raw chunk”，而是：

- 消费共享 run 事件
- 把 assistant message 流式投影成 Telegram 输出

当前处理的事件包括：

- `message.updated`
  - 提取 assistant 文本
  - 节流发送或编辑 Telegram 消息
- `stream.preview.updated`
  - 提取当前 cycle 的实时预览文本
  - 在 committed message 到位前作为 Telegram 流式正文来源
- `stream.preview.cleared`
  - 结束 preview 态
  - 不主动清空 Telegram 正文，等待 committed update 接管
- `run.completed`
  - flush 最终文本
  - 做 final rich-text edit
- `run.failed`
  - 停止后续更新
- `run.aborted`
  - 停止后续更新

## 当前 Telegram streaming 行为

当前实现采用的是：

- 通用 `sendMessage + editMessageText`
- 不区分 private chat / group chat
- 不依赖 draft transport
- committed / preview 双语义消费

行为细节：

1. 第一次收到有效 assistant 文本时：
   - `sendMessage(...)`
   - 保留返回的 `message_id`
2. 后续流式更新：
   - `stream.preview.updated` 优先驱动 Telegram 文本
   - committed `message.updated` 作为正式 transcript 接管
   - 统一节流 `editMessageText(...)`
3. `run.completed` 时：
   - 最终文本经 `formatTelegramRichText(...)`
   - 再做一次 final edit

这保证了：

- Telegram 有真实 outbound `message_id`
- assistant host meta 仍能绑定真实 Telegram message
- 现有数据库语义不需要额外改造

## 为什么 streaming 阶段只发 plain text

当前实现没有在流式阶段做 Telegram HTML 格式化，而是：

- streaming 阶段：plain text
- completed 阶段：final rich-text render

原因是：

- Markdown / HTML 在流式阶段往往是半截文本
- Telegram HTML 对不完整结构容错较差
- 在 final 再统一 render，更接近“稳定输出”

这也和 Chat UI 当前的策略一致：main 内先维护标准化 message state，最终展示层再做宿主特有格式化。

## 为什么当前不引入 `sendMessageDraft`

这轮明确讨论过 Telegram Bot API 的 `sendMessageDraft`，最终决定暂不引入，原因是：

1. 当前通用 `sendMessage + editMessageText` 已满足核心目标
2. `sendMessageDraft` 是 transport 优化，不是架构层刚需
3. `sendMessageDraft` 返回 `true`，不产生真实 `message_id`
4. 当前 assistant outbound host meta 仍围绕真实消息建模
5. draft transport 只适合后续作为 private chat 优化分支，而不是当前主链路

换句话说：

- `TelegramRunResponder` 已经是正确的 run event 消费抽象
- draft 只可能是它下层 transport 策略的后续扩展

## 代码层面的变化

### `chatRun`

- `ChatRunEventSink` 新增到 infrastructure 层
- `ChatRunEventEmitterFactory.create(...)` 支持 sinks
- `RunManager.start/execute(...)` 支持 event sinks
- `ChatRunService.start/execute(...)` 支持 `options.eventSinks`

### `telegram`

- 新增 `TelegramRunResponder`
- `TelegramGatewayService` 不再在 run 结束后：
  - 读取最终 assistant message
  - 重新拼 replyText
  - 一次性 `sendMessage(...)`
- 改为在 `execute(...)` 时把 `TelegramRunResponder` 作为 sink 注入

## 当前边界

这轮改造只做了以下事情：

- Telegram 接入共享 run event 流
- Telegram 流式回复和 Chat UI runtime 语义对齐
- 保留真实消息 id 和 outbound host meta

这轮没有做：

- `sendMessageDraft` transport
- Telegram typing / chat action 提示
- tool phase 专门的 Telegram 状态展示
- Telegram 端专门的失败提示 message

但在 assistant step 组装重构后，Telegram 已正式接入 preview 事件消费：

- `message.updated`
  - committed transcript
- `stream.preview.updated`
  - transient preview

## 测试与验证

本轮新增验证包括：

- `ChatRunEventEmitter` sink fan-out 测试
- `TelegramRunResponder` 的首发 / 节流 / final edit 测试
- `pnpm run typecheck:web`
- `pnpm run typecheck:node`

## 后续演进建议

如果后续继续优化 Telegram 体验，建议按下面顺序推进：

1. 先把 `TelegramRunResponder` 下层 transport 抽象化
   - `TelegramEditMessageTransport`
   - `TelegramDraftMessageTransport`
2. private chat 再灰度启用 `sendMessageDraft`
3. 如有必要，再加入 typing / activity 状态提示

不要反向把 Telegram 特殊逻辑塞回 parser 或 `agentCore`。

## 相关文件

- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramRunResponder.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramRunResponder.ts)
- [event-emitter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/infrastructure/event-emitter.ts)
- [RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunManager.ts)
- [AssistantStepMessageManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepMessageManager.ts)
- [AssistantStepEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepEventMapper.ts)
- [DATA_FLOW.md](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/hooks/chatSubmit/docs/DATA_FLOW.md)
