# 工具执行确认流程

## 概述

工具执行确认由 Main Process 统一协调。Main 在工具进入受保护执行路径时创建待确认请求，通过 run event 通知 Renderer；Renderer 展示确认界面并将用户决策回传给 Main，Main 随后恢复对应工具调用。

确认请求以 `toolCallId` 标识。Main 维护等待决策的 Promise，Renderer 维护用于展示的请求队列，两侧通过 IPC 和 run event 保持同步。

## 组件与职责

| 模块 | 路径 | 职责 |
|------|------|------|
| `ToolConfirmationManager` | `src/main/orchestration/chat/run/infrastructure/tool-confirmation.ts` | 保存 Main 侧待确认项、发送确认事件、处理超时与用户决策 |
| `useToolConfirmations` | `src/renderer/src/features/chat/toolConfirmation/useToolConfirmations.ts` | 订阅 run event，并按当前会话维护 Renderer 队列 |
| `useToolConfirmationStore` | `src/renderer/src/features/chat/state/toolConfirmationStore.ts` | 保存待确认队列并通过 IPC 提交确认或取消决策 |
| `ChatInputToolConfirmation` | `src/renderer/src/features/chat/input/ChatInputToolConfirmation.tsx` | 在聊天输入区上方展示当前确认项 |
| `CommandConfirmation` | `src/renderer/src/features/chat/message/assistant-message/CommandConfirmation.tsx` | 呈现命令、风险说明和操作按钮 |
| `invokeRunToolConfirm` | `src/renderer/src/infrastructure/ipc/run.ts` | 调用 `run:tool-confirm` IPC 通道 |

`src/renderer/src/infrastructure/tools/command/renderer/CommandInvoker.ts` 负责普通命令执行 IPC。Agent run 中的工具确认由上述 run event 流程承担。

## 运行流程

```text
工具进入受保护执行路径
    ↓
ToolConfirmationManager.request()
    ↓
Main 保存 toolCallId 对应的待确认 Promise
    ↓
发送 tool_confirmation_required run event
    ↓
useToolConfirmations 按 chatUuid 过滤事件并 enqueue()
    ↓
ChatInputToolConfirmation 展示队首请求
    ↓
用户确认执行或取消
    ↓
useToolConfirmationStore.confirm()/cancel()
    ↓
invokeRunToolConfirm({ toolCallId, approved, reason? })
    ↓
Main 解析决策并恢复对应工具调用
    ↓
执行状态事件触发 Renderer dequeue(toolCallId)
```

## 状态模型

### Main Process

`ToolConfirmationManager` 使用 `Map<toolCallId, PendingConfirmation>` 保存等待项：

```typescript
type PendingConfirmation = {
  submissionId: string
  promise: Promise<ToolConfirmationDecision>
  resolve: (decision: ToolConfirmationDecision) => void
  timeoutId: NodeJS.Timeout
}
```

- 同一 `toolCallId` 的重复请求复用已有 Promise。
- 默认等待时间为五分钟；超时决策为 `{ approved: false, reason: 'timeout' }`。
- run 取消时，`cancelForSubmission()` 解析该 submission 的全部等待项。
- 自动审批模式通过 `approvePendingForSubmission()` 解析该 submission 的全部等待项。

### Renderer

`useToolConfirmationStore` 保存请求队列：

```typescript
interface ToolConfirmationState {
  pendingRequests: ToolConfirmationRequest[]
}
```

- `enqueue(request)` 按 `toolCallId` 去重并更新已有请求。
- `dequeue(toolCallId)` 清除指定请求。
- `confirm(toolCallId)` 提交批准决策。
- `cancel(reason, toolCallId)` 提交拒绝决策及可选原因。
- `clear()` 在订阅卸载或会话切换时清空 Renderer 队列。

界面一次展示队首请求，并通过计数提示剩余待确认项。提交决策期间，组件保持 settling 状态以防止重复操作。

## 事件同步

`useToolConfirmations(chatUuid)` 订阅 run event：

- `tool_confirmation_required`：将请求加入队列。
- `tool_execution_started`：移除对应请求。
- `tool_execution_completed`：移除对应请求。
- `tool_execution_failed`：移除对应请求。

带有其他 `chatUuid` 的事件由当前聊天实例跳过。组件卸载时会取消订阅并清空本地队列。

## 界面位置

`ChatWindow` 在输入面板上方挂载 `ChatInputToolConfirmation`。确认卡片使用 `CommandConfirmation` 展示：

- 工具命令或参数摘要
- 风险级别与风险原因
- 取消按钮
- 执行确认按钮
- 待确认队列数量

## 测试

相关测试覆盖：

- Main 侧确认请求、重复请求、超时和 submission 取消。
- Renderer 队列去重、确认、取消和请求移除。
- 确认组件渲染、交互锁定与 IPC 参数。
- run event 订阅和会话过滤。

执行以下命令验证：

```bash
pnpm test:run
pnpm run check:renderer-boundaries
pnpm run check:renderer-doc-paths
```

## 扩展约束

- 新的确认类型继续使用 `toolCallId` 作为跨进程关联键。
- Renderer 只保存展示状态；执行暂停和恢复状态由 Main Process 管理。
- IPC payload 的变更需要同步 `src/main`、`src/preload`、`src/shared` 和 Renderer 调用端。
- 新增风险信息时，在共享事件契约和确认 presenter 中同步字段定义。
