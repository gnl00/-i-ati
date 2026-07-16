# 系统原生通知接入方案

Owner: Main process maintainers<br>
Status: Done<br>
Started: 2026-07-14<br>
Completed: 2026-07-14<br>
Target: 应用在后台/最小化时，主进程通过 macOS 通知中心弹出任务完成/失败的原生通知，点击回到 @i<br>
Exit criteria: 交互式 run 在后台完成时弹出系统通知并可点击聚焦；前台完成时不弹（避免与应用内 UI 重复）；subagent 不弹；scheduled 任务不产生重复通知；主进程构建通过，新增单测通过<br>
Related specs: [Documentation governance](../../../specs/documentation-governance.md)<br>
Related architecture: [chat-submit-event-bus](../../../architecture/chat-submit-event-bus.md), [main-process-architecture](../../../architecture/main-process-architecture.md)<br>
Related implementation: `src/main/orchestration/chat/run/runtime/DefaultMainAgentRuntimeRunner.ts`, `src/main/agent/runtime/events/`, `src/main/main-window.ts`

## 背景

当前 @i 的通知有两条 renderer 侧路径，都局限于**应用在前台**：

1. `useScheduleNotifications.ts` 的 `sonner` toast —— 注意它是**调度器（scheduler）路径**，仅对**非当前 chat** 的 scheduled 任务在 `SCHEDULE_EVENTS.UPDATED` 时弹 toast（`useScheduleNotifications.ts:67` 对当前 chat 显式 `return`）。
2. 交互式 agent loop 完成时，走的是 `HostRenderEventForwarder` → renderer 增量渲染，**没有独立完成 toast**。

两者都要求窗口可见。用户切出去干别的时，任务完成没有任何跨应用反馈。

目标：在 main process 用 macOS Notification Center 弹系统原生通知，应用在后台也能收到，点击回到 @i。

## API 选择

**Electron `Notification`**，走 macOS `UNUserNotification`，零额外依赖。

```typescript
import { Notification } from 'electron'

const n = new Notification({ title: '@i 任务完成', body: summary, silent: false })
n.on('click', () => showMainWindow())
n.show()
```

macOS 特有能力（后续可选增强，非本期范围）：

| 能力 | API |
|------|-----|
| 点击回调 | `notification.on('click', handler)` |
| 通知按钮 | `actions: [{ type: 'button', text: '查看' }]` |
| 回复框 | `hasReply: true` / `replyPlaceholder` |
| 自定义声音 | `sound: 'Purr'` |

## 关键修正（相对初版方案）

初版方案有三处会导致 bug，本方案已修正：

### 修正一：注册位置 —— 否则 subagent 会刷屏通知

`agentEventBus` 不是单例，而是**每次 run 各自 new 一个**，共有两处：

- `DefaultMainAgentRuntimeRunner.ts:52`（主 chat run）
- `SubagentRuntimeRunner.ts:84`（subagent run）

初版说"注册到 `AgentLoopDependenciesFactory`"是错的：factory 被两条链路共用，注册在那里会让**每个 subagent 的 `loop.completed` 都弹一条系统通知**。

**正确做法：只在 `DefaultMainAgentRuntimeRunner` 里注册 sink。** subagent 链路完全不碰。

### 修正二：必须有前台门控 —— 否则前台完成会"双重通知"

初版的"前台 toast / 后台系统通知"表格没有落到代码：`handle()` 是**无条件** `n.show()`。仓库已有正确判据（`WebToolsProcessor.ts:551`）：

```typescript
!mainWindow.isDestroyed() && mainWindow.isVisible()
```

sink 内必须先判断窗口状态，**窗口可见且聚焦时跳过**系统通知（此时应用内 UI 已经覆盖反馈），只在后台/最小化/失焦时弹。

### 修正三：区分触发来源 —— 否则 scheduled 任务重复通知

scheduled 任务经 `SchedulerService.ts:153` → `runService.execute()` → **同一个** `DefaultMainAgentRuntimeRunner`。若 sink 无差别地对所有 run 弹通知，后台 scheduled 任务会同时收到：

- scheduler 已有的 `sonner` toast（`useScheduleNotifications.ts`）
- 新增的系统通知

调度器在提交时已带标记 `input.source === 'schedule'`（`SchedulerService.ts:162`）。sink 读 `input.runInput.input.source`，**`source === 'schedule'` 时跳过**，把 scheduled 任务的通知职责留给现有 scheduler 路径。

> 备选决策（需 owner 拍板，勿默默执行）：将 scheduler 通知也统一迁移到系统原生通知（删除 renderer toast，改由本 sink 处理 scheduled + interactive）。收益是通知体验一致且后台可达；代价是 scheduler 现有前台 toast 行为变化。**本期默认不迁移**，仅覆盖 interactive run。

## 架构方案

### 事件通道

用 `AgentEventBus` + `AgentEventSink`（`src/main/agent/runtime/events/`）。通知只需知道"完成/失败"事实，不需要 host 层 payload；`AgentEventSink` 接口只有 `handle(event)`，最简。

消费三类 `LoopEvent`：
- `loop.completed` → 弹"任务完成"，`silent: false`，body 取 `finalStep.content` 摘要
- `loop.failed` → 弹"任务失败"，`silent: true`，body 取 `result.failure.message`
- `loop.aborted` → 不弹（通常是用户主动取消）

`finalStep.content` 是纯字符串（`AgentStep.ts:34`），摘要实现很简单：截断 + 去换行 + 兜底文案。

### 实现步骤

#### 1. `main-window.ts` 导出 `showMainWindow()` 与 `isMainWindowForeground()`

当前有 `getMainWindow()` / `createWindow()` / `windowsMinimize()`，但没有统一的"显示并聚焦"和"前台判定"导出。新增：

```typescript
export function showMainWindow(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// 前台门控：窗口存在、可见且聚焦
export function isMainWindowForeground(): boolean {
  const win = getMainWindow()
  return !!win && win.isVisible() && win.isFocused()
}
```

注意 `main-window.ts:60` 的 close 行为：macOS 下红点关闭是 `app.hide()`，窗口 `isVisible()` 在 hide 后为 false —— 正好符合"后台才弹"的语义。

#### 2. 创建 `AgentNotificationSink`

```
src/main/notifications/
└── AgentNotificationSink.ts
```

```typescript
import { Notification } from 'electron'
import type { AgentEventSink } from '../agent/runtime/events/AgentEventSink'
import type { AgentEvent } from '../agent/runtime/events/AgentEvent'
import { showMainWindow, isMainWindowForeground } from '../main-window'

export class AgentNotificationSink implements AgentEventSink {
  handle(event: AgentEvent): void {
    // 前台门控：应用在前台时应用内 UI 已覆盖反馈，跳过系统通知
    if (isMainWindowForeground()) return

    switch (event.type) {
      case 'loop.completed':
        this.notify('@i 任务完成', this.summarize(event.result.finalStep?.content), false)
        break
      case 'loop.failed':
        this.notify('@i 任务失败', event.result.failure?.message ?? '执行过程中出现错误', true)
        break
      // loop.aborted：用户主动取消，不弹
    }
  }

  private notify(title: string, body: string, silent: boolean): void {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, silent })
    n.on('click', () => showMainWindow())
    n.show()
  }

  private summarize(content?: string): string {
    const text = (content ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return '本轮任务执行完毕'
    return text.length > 120 ? `${text.slice(0, 120)}…` : text
  }
}
```

#### 3. 只在 `DefaultMainAgentRuntimeRunner` 注册（含 source 门控）

在 `DefaultMainAgentRuntimeRunner.run()` 里，`eventBus` 创建之后（当前 `DefaultMainAgentRuntimeRunner.ts:52` 附近）：

```typescript
const eventBus = new DefaultAgentEventBus()

// interactive run 才注册系统通知；scheduled 任务的通知由 scheduler 路径负责
if (input.runInput.input.source !== 'schedule') {
  eventBus.register(new AgentNotificationSink())
}
```

subagent 链路（`SubagentRuntimeRunner`）不改，天然不弹通知。

### 通知矩阵（修正后）

| 触发来源 | 应用状态 | renderer 反馈 | 系统通知（新增） |
|---------|---------|--------------|----------------|
| interactive | 前台 | 应用内增量渲染 | 跳过（前台门控） |
| interactive | 后台/最小化 | 无 | ✅ 弹出，点击聚焦 |
| scheduled | 前台 | scheduler toast（已有） | 跳过（source 门控） |
| scheduled | 后台 | scheduler toast（已有） | 跳过（source 门控，避免重复） |
| subagent | 任意 | —— | 跳过（不注册 sink） |
| aborted（用户取消） | 任意 | —— | 不弹 |

## 不需要做的事

- ❌ 不需要改 preload / 不需要 IPC 新通道
- ❌ 不需要改 renderer 代码（scheduler toast 保持原状）
- ❌ 不需要额外 npm 依赖
- ❌ 不需要处理 macOS 通知权限（Electron 自动处理；打包后需已签名应用才能稳定送达）
- ❌ 不需要处理 Windows/Linux 兼容（`Notification` 跨平台，API 一致；前台门控逻辑一致适用）

## 实施顺序

1. `main-window.ts` 导出 `showMainWindow()` 与 `isMainWindowForeground()`
2. 创建 `src/main/notifications/AgentNotificationSink.ts`
3. 在 `DefaultMainAgentRuntimeRunner` 注册（带 `source !== 'schedule'` 门控）
4. 单测：`AgentNotificationSink.handle` 在前台跳过、后台弹、aborted 不弹、summarize 截断与兜底
5. 手测：切到其他应用 → 让 @i 执行一个交互任务 → 确认通知中心弹出 → 点击回到 @i；再验证前台完成时不弹、scheduled 后台完成不重复弹

## 待决策项

- 是否将 scheduler 通知统一迁移到系统原生通知（见"修正三"备选决策）。本期默认否。
