# Subagent MVP

本文档描述当前仓库中已经落地的 `subagent` 第一阶段与第二阶段前半部分实现，不包含尚未完成的未来方案。

## 目标

当前 `subagent` 的目标是：

- 让主代理把一个边界清晰的子任务派发到后台执行
- 让子代理拥有独立上下文和独立工具执行能力
- 让主代理后续通过 `subagent` (action: wait) 汇总结果
- 让用户在 UI 中直接看到 subagent 的运行状态，而不依赖主代理必须再次调用 `subagent` (action: wait)

当前实现不是 Worker Thread，也不是独立进程。

- 子代理运行在 Electron main 进程内
- 每个 subagent 是一个独立的内存态运行时
- 结果默认不写回主 chat 消息历史，只通过 tool result 和运行时事件回流

## 核心文件

### shared schema

- [definitions.ts](../../src/shared/tools/subagent/definitions.ts)
- [index.d.ts](../../src/shared/tools/subagent/index.d.ts)
- [subagent.ts](../../src/shared/prompts/subagent.ts): 独立 worker system prompt

### main runtime

- [subagent-run-service.ts](../../src/main/services/subagent/subagent-run-service.ts)
- [subagent-runtime-factory.ts](../../src/main/services/subagent/subagent-runtime-factory.ts)
- [subagent-registry.ts](../../src/main/services/subagent/subagent-registry.ts)
- [subagent-runtime-bridge.ts](../../src/main/services/subagent/subagent-runtime-bridge.ts)
- [types.ts](../../src/main/services/subagent/types.ts)

### renderer

- [SubagentResults.tsx](../../src/renderer/src/features/chat/message/assistant-message/toolcall/SubagentResults.tsx)
- [subagentRuntimeStore.ts](../../src/renderer/src/features/subagents/subagentRuntimeStore.ts)
- [useSubagentRuntime.ts](../../src/renderer/src/features/subagents/useSubagentRuntime.ts)

## 工具接口

当前提供一个 `subagent` 工具，通过 `action` 区分两种操作：

- `subagent` (action: spawn)
- `subagent` (action: wait)

### `subagent` (action: spawn)

用途：

- 创建并后台启动一个子代理任务

主要参数：

- `task`
- `role`
- `context_mode`
- `files`
- `background`

运行时会额外自动注入：

- `chat_uuid`
- `model_ref`
- `parent_submission_id`

### `subagent` (action: wait)

用途：

- 等待指定 `subagent_id` 完成
- 或在超时前返回当前状态

## 运行模型

### 1. 创建

主代理调用 `subagent` (action: spawn) 后：

- `SubagentRunService.spawn()` 创建一条内存态记录
- 初始状态为 `queued`
- 立即返回 tool result
- 后台异步启动实际运行

### 2. 执行

`SubagentRuntimeFactory` 会：

- 解析 `modelRef`
- 通过 `buildSubagentSystemPrompt(role)` 构建独立 worker system prompt
- 注入精简上下文
- 将任务、模型、工作目录和角色工具权限交给 `DefaultSubagentRuntimeRunner`
- runner 创建独立 `ToolExecutor` 并复用父 run 确认链
- 在当前主路径里复用新的 runtime / tool execution 链路，而不是旧 `AgentRunKernel + AgentStepLoop`

子代理不会把自己的中间消息直接插入主 chat。

### Worker 提示词职责

子代理使用独立执行提示词，聚焦委派任务、角色重点、仓库指令、证据、
已有用户改动保护、工具权限与确认，以及结果交付。它向主代理报告缺失信息、
权限或授权，最终结果包含发现或改动、证据位置、改动文件、验证和剩余限制。

主会话的 `SystemPromptComposer` 继续负责 @i 身份、Soul、技能目录、用户资料、
情绪和全局状态策略；这些模块不进入 worker prompt。主代理应在 `task` 中明确
携带相关用户约束与任务授权范围，精简聊天片段只提供背景。

这一职责分离不改变角色工具权限、执行审批、80 步上限和结果回流。
决策与取舍见 [ADR 0040](../decisions/0040-independent-subagent-system-prompt.md)。

### 3. 汇总

执行完成后：

- `SubagentRegistry` 将状态更新为 `completed` 或 `failed`
- 保存：
  - `summary`
  - `artifacts.tools_used`
  - `artifacts.files_touched`

主代理如果需要拿最终结果，再调用 `subagent` (action: wait)。

## 上下文注入

`SubagentRuntimeFactory.buildUserTaskMessage()` 始终组合：

- 当前任务描述
- 文件提示 `files`
- 结果交付要求

`minimal` 模式只传入这些内容。`current_chat_summary` 模式存在父 chat 时还会加入：

- 最近 8 条消息各截取最多 400 个字符的片段
- 父 chat 的 work context 只读快照，缺失或读取失败时使用模板
- 最多 5 条最近 activity journal 记录，读取失败时省略

子 runtime 不注入主会话的 `<awake_state>`、`<user_info_context>` 或技能上下文。
`files` 是定位提示，不是写入隔离边界；聊天片段也不保证包含完整任务约束。

## 工具权限

当前工具权限不是手写一个固定允许列表，而是：

- 工具 metadata
- agent kind / role
- 运行时解析

相关代码：

- [metadata.ts](../../src/shared/tools/metadata.ts)
- [permissions.ts](../../src/shared/tools/permissions.ts)
- [registry.ts](../../src/shared/tools/registry.ts)

当前 subagent 已允许常用工具，包括：

- `ls`
- `glob`
- `grep`
- `read`
- `write`
- `edit`
- `web_search`
- `web_fetch`
- `memory_retrieval`
- `history_search`
- `activity_journal_search`
- `exec`

`write` 和 `edit` 只向 `general` / `coder` 开放。
`researcher` / `reviewer` 仍可调用 `exec`，所以工具过滤不等于操作系统级只读隔离。

当前仍未开放：

- `plan`
- `schedule`
- `session_context` 和全局用户资料、情绪及技能管理工具
- `subagent`，执行器也拒绝未授权的递归调用
- 插件安装/卸载类工具

## 确认链

### approval policy

当前 subagent 默认使用：

- `relaxed`

用户的 `permissionApprovalMode` 沿用父请求：

- `manual` 下，`safe` 且没有文件系统范围风险的命令自动通过；
  `warning / dangerous`、工作区外路径或需要确认的环境覆盖进入父确认链。
- `auto` 下，运行时沿用既有自动批准策略。
- 缺少父 submission 或确认通道时，需要确认的操作会被拒绝。

相关代码：

- [approval.ts](../../src/shared/tools/approval.ts)
- [ToolExecutor.ts](../../src/main/agent/tools/ToolExecutor.ts)

### 父 run 桥接

子代理本身不直接拥有独立 UI 确认通道。

当前实现是：

- 旧设计里，主 chat run 曾通过 chat-side step factory 注册自己的：
  - `ToolConfirmationRequester`
  - `RunEventEmitter`
- subagent 通过 [subagent-runtime-bridge.ts](../../src/main/services/subagent/subagent-runtime-bridge.ts) 复用父 run 的确认链

这意味着：

- subagent 的 `exec` 危险命令会回到主 chat 的确认 UI
- renderer 不需要单独再开一套确认协议

## UI 状态卡

### 为什么不依赖 `subagent` (action: wait)

用户需要看到的是：

- 已创建
- 正在运行
- 是否卡在确认
- 是否完成

如果 UI 只能依赖 `subagent` (action: wait)，那么当主代理没有主动再次调用 `subagent` (action: wait) 时，用户就看不到显眼状态。

因此当前 UI 设计是：

- `subagent` (action: spawn) 和 `subagent` (action: wait) 都会渲染成轻量状态卡
- 状态本身通过 chat run 事件实时更新

### 当前状态流

当前 renderer 可以显示：

- `queued`
- `running`
- `waiting_for_confirmation`
- `completed`
- `failed`

事件来源：

- `subagent.updated`
- `tool.confirmation.required`

渲染方式：

- [ToolCallResult.tsx](../../src/renderer/src/features/chat/message/assistant-message/toolcall/ToolCallResult.tsx) 对 `subagent` 做特殊分支
- 实际卡片在 [SubagentResults.tsx](../../src/renderer/src/features/chat/message/assistant-message/toolcall/SubagentResults.tsx)

### 当前行为

- `subagent` (action: spawn) 不再永远停在创建时的静态 `Queued`
- renderer 会根据运行时 store 把它更新为：
  - `Running`
  - `Waiting for confirmation`
  - `Completed`
  - `Failed`

## 已知边界

当前版本仍然有这些明确边界：

- 子代理运行记录是内存态，不持久化
- 子代理不会再 spawn 子代理
- `plan` 工具没有开放给 subagent
- `exec` 仍然受主确认链控制
- `artifacts.files_touched` 只自动收集 `write` / `edit` 返回的路径；通过 `exec`
  修改的文件仍需在最终文字交付中报告
- `subagent` (action: wait) 主要用于让主代理拿最终结果，不负责 UI 状态可见性
- 主 chat message 中的 tool call 投影仍然偏简化，完整中间过程更多依赖运行时事件和 subagent 状态卡

## 下一步建议

后续优先级建议：

1. 把 `waiting_for_confirmation -> confirmed / cancelled` 的状态过渡补完整
2. 优化 subagent 卡片的状态文案与动画
3. 视需要再考虑：
   - 持久化
   - subagent 面板
   - 更复杂的 role / policy
