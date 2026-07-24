# 系统原生通知接入方案

Owner: Main process maintainers<br>
Status: Done<br>
Started: 2026-07-14<br>
Updated: 2026-07-23<br>
Target: 交互式与 scheduled main-agent run 在应用后台时通过系统通知反馈终态<br>
Related architecture: [Scheduled tasks](../../../architecture/scheduled-tasks.md), [Chat submit event bus](../../../architecture/chat-submit-event-bus.md), [Main process architecture](../../../architecture/main-process-architecture.md)<br>
Related implementation: `src/main/notifications/AgentNotificationSink.ts`, `src/main/orchestration/chat/run/runtime/DefaultMainAgentRuntimeRunner.ts`, `src/main/services/scheduler/SchedulerService.ts`

## 目标

应用处于后台、最小化或失焦状态时，main process 使用 Electron
`Notification` 发送任务完成或失败通知。点击通知恢复并聚焦主窗口。
应用前台继续使用现有界面反馈。

通知覆盖两个 main-agent 来源：

- interactive，`input.source` 为 `undefined`
- scheduled，`input.source` 为 `schedule`

Telegram 等 host 保持各自的消息与通知职责。Subagent 运行保持独立事件总线。

## 注册边界

`DefaultMainAgentRuntimeRunner` 为每次 main-agent run 创建
`DefaultAgentEventBus`。runner 根据 source 注册 `AgentNotificationSink`：

```text
source = undefined  -> register native notification sink
source = schedule   -> register native notification sink
source = telegram   -> host-owned notification path
other host source   -> host-owned notification path
```

`RunRuntimeFactory` 注入 production factory，并将 chat title 与失败通知策略
传给 sink。该位置只覆盖 main-agent run，subagent event bus 保持原有组成。

## 触发与反馈

`AgentNotificationSink` 消费 agent loop 终态：

- `loop.completed`：发送普通通知，正文来自 `finalStep.content` 摘要
- `loop.failed`：发送静默通知，正文来自 failure message
- `loop.aborted`：结束本轮通知处理

流式渲染事件与 `message.updated` 继续服务聊天界面。常规系统通知消费 loop
终态。sink 内部终态锁保证单个注册实例最多显示一条通知。

正文会合并空白，并按 Unicode code point 截取 120 个字符。空正文使用稳定
兜底文案。通知展示后 badge 加一；点击或关闭释放 notification 强引用；点击
同时调用 `showMainWindow()`。

`isMainWindowForeground()` 提供前台门控。可见且聚焦的主窗口使用应用内反馈；
后台、最小化和失焦状态使用系统通知。

## Scheduled occurrence 策略

一次 occurrence 可以经历多个执行 attempt。`SchedulerService` 在提交
`RunService.execute()` 时传入 `nativeNotification.notifyOnFailure`：

- 中间 attempt：`false`，sink 保留成功通知并跳过本次失败通知
- 最终 attempt：`true`，sink发送最终失败通知

因此每个 occurrence 最多产生一条系统通知：任一 attempt 成功时发送完成通知，
所有 attempt 耗尽时发送一次失败通知。通知触发点继续保持
`loop.completed` / `loop.failed`。

每次 attempt 还携带稳定的 `occurrenceKey`。sink 使用 1000 项有界去重集合，
覆盖跨 attempt 和重复终态投递；进程重启后的 scheduler recovery 会直接结束
中断 occurrence，因此这组进程内键覆盖正常执行窗口。

部分错误会在 agent loop 建立前结束 attempt，包括 chat 已删除、modelRef
无法解析，以及 chat preparation 失败。最终 attempt 由 `SchedulerService`
调用通知模块的 direct terminal-failure 入口，传入真实错误与相同的
`occurrenceKey`。该入口复用 sink 的前台门控、去重、Notification 展示、
badge、点击聚焦和 strong reference。

`RunService.execute()` 成功返回后会设置 execution-settled 标志。后续 cron
计算或持久化异常继续进入 scheduler 状态处理，并保持与 agent 执行失败通知
分离。启动恢复继续使用持久化状态和 schedule events。

## 通知矩阵

| 触发来源 | 应用状态 | 应用内反馈 | 系统通知 |
| --- | --- | --- | --- |
| interactive | 前台 | 增量渲染与运行状态 | 前台门控 |
| interactive | 后台/最小化 | 界面状态持续更新 | 完成或失败通知 |
| scheduled | 前台 | scheduler toast 与任务板更新 | 前台门控 |
| scheduled | 后台/最小化 | 任务板状态持续更新 | occurrence 完成或最终失败通知 |
| telegram 等 host | 任意 | host 消息反馈 | host 独立职责 |
| subagent | 任意 | parent run 汇总 | 独立 event bus |
| aborted | 任意 | 取消状态 | 结束通知处理 |

## 验证

- `AgentNotificationSink`：前台门控、完成、失败、aborted、摘要、badge、点击聚焦、
  strong reference、终态锁、direct terminal failure 和 occurrence 去重
- `DefaultMainAgentRuntimeRunner`：interactive 与 schedule 注册，Telegram source
  保持 host 路径，schedule completion 只到达一次
- `SchedulerService`：中间 attempt 传 `notifyOnFailure: false`，最终 attempt 传
  `notifyOnFailure: true`；pre-runtime 最终失败调用 direct fallback；execution
  成功后的 scheduler finalization 异常保持独立
- `RunRuntimeFactory`：production factory 传递 chat title 与通知策略

## 未来优化

高频 cron 通知合并/限流（阈值待产品反馈确定）。当前版本保持逐 occurrence
终态通知，阈值与限流策略进入后续产品验证。
