# Assistant Step Assembler

> 这份文档记录 2026-03-29 这轮 assistant step 消息组装重构的最终边界。
> 目标是彻底解决多 cycle tool turn 下的消息污染、tool result 丢失、preview/committed 语义混淆和 UI 闪动问题。

## 背景

在这轮重构前，assistant turn 的组装同时分散在两侧：

1. main 侧
   - `AgentStepLoop`
   - `ChatStepCommitter`
2. renderer 侧
   - `AssistantMessage`
   - preview/committed 的浅层拼接

结果是：

- 同一个 tool cycle 的文本、tool activity、最终正文会在多处被覆盖或重建
- `segments` 和 `body.toolCalls` 会漂移
- preview 会被当成“另一条 assistant message”
- renderer 会因为 preview/committed 分支切换导致同一 segment remount

## 当前分层

这轮重构后，assistant step 的状态拆成三层：

1. `RequestHistory`
   - 给模型续推理用
   - 保留 assistant/tool/result 的协议历史
2. `AssistantCycleBuffer`
   - 当前 cycle 的 runtime buffer
   - 负责收集 streaming delta、tool call、tool result segment
3. `AssistantStepAssembler`
   - 当前 step 的消息组装真源
   - 统一产出：
     - committed assistant body
     - transient preview body

## `AssistantStepAssembler` 的职责

文件：

- 当前生产代码中已移除；这里描述的是历史上的 assistant projection 规则

它不关心模型请求、也不关心 renderer，只做一件事：

- 把一个 step 内多个 cycle 的事实组装成稳定的 assistant turn 视图

当前提供的能力：

- `beginCycle()`
- `updatePreview(snapshot)`
- `clearPreview()`
- `commitToolCycle(snapshot)`
- `commitFinalCycle(snapshot)`
- `getView()`

## 组装规则

### 1. committed 与 preview 分离

- committed body
  - 代表正式 transcript
- preview body
  - 代表当前 cycle 的临时流式预览
  - 不落库
  - 不等于正式 message

### 2. tool activity 是 append-only

对于 committed body：

- `toolCall`
- `error`

一旦进入 committed transcript，就不应该被后续 cycle 覆盖掉。

### 3. final text 追加到同一 assistant turn

最终正文到来时：

- 保留已有 `toolCall/error`
- 再追加 final cycle 的 `segments`
- 同步更新 `content`

### 4. tool-only committed 层不保留 transient reasoning/text

tool flush 阶段 committed body 只保留稳定的：

- `toolCall`
- `error`

`reasoning/text` 只留在 preview 层，避免：

- 先进入 committed
- 后面 final commit 又被挤掉

### 5. `body.toolCalls` 与 `segments` 同步保留

多 cycle tool turn 下：

- `segments` 里会保留历史 `toolCall` segment
- `body.toolCalls` 也必须按 `toolCall.id` 合并保留

否则下游依赖 `body.toolCalls` 的逻辑会和 renderer 可见结构不一致。

## Chat host 的消费方式

`ChatStepCommitter` 不再负责发明消息合并策略，它现在只消费 assembler 输出：

- committed body -> `message.updated`
- preview body -> `stream.preview.updated`

也就是说，`ChatStepCommitter` 现在是一个投影/发射层，而不是组装层。

## Renderer 侧约束

renderer 不再负责“拼出最终 assistant message”。

正确消费方式是：

- `messages[]`
  - 只表示 committed transcript
- `streamPreviewMessage`
  - 只表示当前 latest assistant turn 的 preview overlay

`AssistantMessage` 的正确渲染模型是：

- committed layer
- preview layer

而不是：

- committed message 和 preview message 浅拼成一个 `displayMessage`

## Telegram host 的含义

这轮重构后，共享 run event 的语义已经变成两层：

- `message.updated`
  - committed transcript
- `stream.preview.updated`
  - transient preview

Telegram 这类宿主如果想保持和 chat UI 一致的流式体验，也应该消费 preview 事件，而不是只看 committed `message.updated`。

## 当前收益

这轮收口后，系统修复了以下问题：

- 多 cycle tool turn 不再把多个 assistant cycle 拼进同一条 message
- tool result 不再在后续 cycle 中被覆盖掉
- preview 不再伪装成 committed transcript
- renderer 不再因为 committed/preview 分支切换而 remount 同一 segment
- `body.toolCalls` 和 `segments` 的 tool linkage 保持一致

## 后续建议

如果后续继续演进，建议遵循这两个原则：

1. 不要把组装逻辑放回 renderer
2. 不要让 `ChatStepCommitter` 重新承担 assembler 职责

assistant turn 的真源应该继续只保留在 `AssistantStepAssembler`。
