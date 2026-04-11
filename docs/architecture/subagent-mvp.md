# Subagent MVP

本文档描述当前仓库中已经落地的 `subagent` 第一阶段与第二阶段前半部分实现，不包含尚未完成的未来方案。

## 目标

当前 `subagent` 的目标是：

- 让主代理把一个边界清晰的子任务派发到后台执行
- 让子代理拥有独立上下文和独立工具执行能力
- 让主代理后续通过 `subagent_wait` 汇总结果
- 让用户在 UI 中直接看到 subagent 的运行状态，而不依赖主代理必须再次调用 `subagent_wait`

当前实现不是 Worker Thread，也不是独立进程。

- 子代理运行在 Electron main 进程内
- 每个 subagent 是一个独立的内存态运行时
- 结果默认不写回主 chat 消息历史，只通过 tool result 和运行时事件回流

## 核心文件

### shared schema

- [subagent_tools.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/definitions/subagent_tools.ts)
- [index.d.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/subagent/index.d.ts)

### main runtime

- [subagent-run-service.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/subagent/subagent-run-service.ts)
- [subagent-runtime-factory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/subagent/subagent-runtime-factory.ts)
- [subagent-registry.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/subagent/subagent-registry.ts)
- [subagent-runtime-bridge.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/subagent/subagent-runtime-bridge.ts)
- [types.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/subagent/types.ts)

### renderer

- [SubagentResults.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/assistant-message/toolcall/SubagentResults.tsx)
- [subagentRuntime.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/store/subagentRuntime.ts)
- [useSubagentRuntime.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/hooks/useSubagentRuntime.ts)

## 工具接口

当前提供两个工具：

- `subagent_spawn`
- `subagent_wait`

### `subagent_spawn`

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

### `subagent_wait`

用途：

- 等待指定 `subagent_id` 完成
- 或在超时前返回当前状态

## 运行模型

### 1. 创建

主代理调用 `subagent_spawn` 后：

- `SubagentRunService.spawn()` 创建一条内存态记录
- 初始状态为 `queued`
- 立即返回 tool result
- 后台异步启动实际运行

### 2. 执行

`SubagentRuntimeFactory` 会：

- 解析 `modelRef`
- 组合 subagent 专用 system prompt
- 注入精简上下文
- 创建独立 `ToolExecutor`
- 在当前主路径里复用新的 runtime / tool execution 链路，而不是旧 `AgentRunKernel + AgentStepLoop`

子代理不会把自己的中间消息直接插入主 chat。

### 3. 汇总

执行完成后：

- `SubagentRegistry` 将状态更新为 `completed` 或 `failed`
- 保存：
  - `summary`
  - `artifacts.tools_used`
  - `artifacts.files_touched`

主代理如果需要拿最终结果，再调用 `subagent_wait`。

## 上下文注入

当前子代理不是拿整个 chat 全量历史，而是拿精简上下文。

`SubagentRuntimeFactory.buildUserTaskMessage()` 会组合：

- 当前任务描述
- 最近消息摘要
- `work_context`
- 最近 activity journal 片段
- 文件提示 `files`

这样做的目标是：

- 降低 token 噪音
- 保持子任务聚焦

## 工具权限

当前工具权限不是手写一个固定允许列表，而是：

- 工具 metadata
- agent kind / role
- 运行时解析

相关代码：

- [metadata.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/metadata.ts)
- [permissions.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/permissions.ts)
- [registry.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/registry.ts)

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
- `work_context_get`
- `activity_journal_search`
- `execute_command`

当前仍未开放：

- `plan_create`
- `schedule_*`
- 插件安装/卸载类工具

## 确认链

### approval policy

当前 subagent 默认使用：

- `relaxed`

已经实现的策略：

- `plan_create`
  - relaxed 下自动通过
- `execute_command`
  - `safe` 自动通过
  - `warning / dangerous` 进入确认链

相关代码：

- [approval.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/approval.ts)
- [ToolExecutor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agent/tools/ToolExecutor.ts)

### 父 run 桥接

子代理本身不直接拥有独立 UI 确认通道。

当前实现是：

- 旧设计里，主 chat run 曾通过 chat-side step factory 注册自己的：
  - `ToolConfirmationRequester`
  - `ChatRunEventEmitter`
- subagent 通过 [subagent-runtime-bridge.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/subagent/subagent-runtime-bridge.ts) 复用父 run 的确认链

这意味着：

- subagent 的 `execute_command` 危险命令会回到主 chat 的确认 UI
- renderer 不需要单独再开一套确认协议

## UI 状态卡

### 为什么不依赖 `subagent_wait`

用户需要看到的是：

- 已创建
- 正在运行
- 是否卡在确认
- 是否完成

如果 UI 只能依赖 `subagent_wait`，那么当主代理没有主动再次调用 `subagent_wait` 时，用户就看不到显眼状态。

因此当前 UI 设计是：

- `subagent_spawn` 和 `subagent_wait` 都会渲染成轻量状态卡
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
- `tool.exec.requires_confirmation`

渲染方式：

- [ToolCallResultNextOutput.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/assistant-message/toolcall/ToolCallResultNextOutput.tsx) 对 `subagent_spawn / subagent_wait` 做特殊分支
- 实际卡片在 [SubagentResults.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/assistant-message/toolcall/SubagentResults.tsx)

### 当前行为

- `subagent_spawn` 不再永远停在创建时的静态 `Queued`
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
- `execute_command` 仍然受主确认链控制
- `subagent_wait` 主要用于让主代理拿最终结果，不负责 UI 状态可见性
- 主 chat message 中的 tool call 投影仍然偏简化，完整中间过程更多依赖运行时事件和 subagent 状态卡

## 下一步建议

后续优先级建议：

1. 把 `waiting_for_confirmation -> confirmed / cancelled` 的状态过渡补完整
2. 优化 subagent 卡片的状态文案与动画
3. 视需要再考虑：
   - 持久化
   - subagent 面板
   - 更复杂的 role / policy
