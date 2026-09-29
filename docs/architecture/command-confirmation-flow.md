# 工具审批生命周期与多端同步

工具审批由 Main 的 `ToolConfirmationManager` 统一管理。Chat IPC、Telegram 和 TUI 的默认 `RunService` 共享同一套运行协调依赖，包括活动 run 注册表、审批和问答管理器。显式注入的运行依赖保持隔离，适用于测试。

```text
Chat / Telegram / TUI / 超时 / 取消 / 自动审批
                    ↓
      Main 审批记录：验证身份、接受一次决策
                    ↓
          tool.confirmation.resolved
          ↙         ↓          ↘
       Chat UI    Telegram      TUI
                    ↓
               恢复工具调用
```

## 状态与身份

共享契约位于 `src/shared/tools/confirmation.ts`。每轮审批有独立的 `confirmationId`，同时关联 `submissionId`、`chatUuid`、`toolCallId`。同一 run/tool 的 pending 重复请求复用 Promise；前一轮结束后再次请求生成新的审批身份。Telegram callback 使用 32 字符审批身份，完整 callback 小于平台 64 字节限制。

审批状态为 `pending / approved / denied / expired / cancelled`，包含创建、到期、处理时间、全局递增版本和决策来源。终态包含实际决策及可选的审批参数替换。

审批和执行是两个独立维度。已批准表示获准执行；真正开始后由执行事件显示 running，执行结果决定 success/failed/aborted。审批结束立即关闭确认界面，无需等待工具开始或结束。

## Main 状态转换

`src/main/orchestration/chat/run/infrastructure/tool-confirmation.ts` 保存 pending 描述、emitter、Promise 和定时器，并保留最近 500 个终态记录。pending 项不会因终态缓存上限被淘汰。

- 默认五分钟超时，状态变为 expired，工具收到拒绝决策。
- 提交时再次检查到期时间，避免延迟定时器接受已过期批准。
- Chat 和 TUI 提交完整四字段身份；Main 校验 boolean 决策和可选原因类型。
- Telegram 在 gateway 配置授权检查后提交审批身份；Main 在创建审批时读取 chat 的 active Telegram 绑定，加上可信发起 host，冻结并去重 peer/topic 列表。桌面和 Telegram 发起的 run 使用同一规则。决策来源由 Main 入口填写。
- 第一个有效决策同步移除 pending 并记录终态。后续提交返回 `already_resolved` 和实际结果；不匹配返回 `identity_mismatch`；不存在返回 `not_found`。
- 取消和 run 结束清理该 submission 的 pending 审批；切换自动审批通过相同终态转换发布结果。
- Main 先保存终态、发布 resolved，再恢复 Promise。host 网络和展示失败不会撤销已经接受的决策。

required/resolved 事件通过现有 `RunEventEmitter` 发往 Renderer 和 run sinks，同时进入现有 run-event trace。活动状态仅在当前 Main 进程内有效；重启不恢复可执行授权，旧 Telegram 按钮返回请求失效。

## Chat 恢复与展示

`src/renderer/src/features/chat/toolConfirmation/useToolConfirmations.ts` 先激活会话并订阅，再通过 `run:tool-confirmation:snapshot` 获取快照；窗口重新获得焦点时重新读取。

快照包含该 chat 的 pending 和有界终态记录，以及 Main 版本水位。store 合并快照时保留读取期间版本更高的事件，忽略低于水位或已知记录版本的旧事件。会话切换使用 generation 防止旧请求污染新会话，包括切走后又切回相同 UUID。

`run:tool-confirm` 提交完整审批身份并返回 Main 的真实受理结果。UI 不按点击意图删除卡片；它消费 resolved 事件和命令返回的权威记录。传输失败保留请求并显示错误，not_found/identity_mismatch 重新读取快照。

`ChatInputToolConfirmation` 用 confirmationId 锁定提交中的卡片。工具行和 inspector 以审批投影区分等待审批、已批准和真正运行；终态执行结果优先。计划预审和子代理等待提示也从同一审批投影派生，移除独立的等待确认副本。

## Telegram 与 TUI

`TelegramGatewayService` 通过 `RunService.subscribeToolConfirmations` 订阅 Main 审批管理器，是 Telegram 审批展示入口，覆盖桌面、Telegram 和同进程 TUI 发起。它按审批身份与 peer/topic 保存 Telegram messageId 关联，按版本更新文字和按钮。host-render responder 负责执行和消息展示；detected/pending 仅保存工具信息，执行开始才发送 start，结果到达不会补造 start。

审批发送过程中收到决策，会在 send 完成后更新同一消息。编辑失败保留未同步版本，每五秒重试；gateway 暂停时保留关联，polling 恢复后继续同步。保留所有 pending 关联和最近 500 个终态关联，最旧终态超过上限后不再重试。重复 callback 按 Main 已有决策反馈；应用重启后的旧 callback 提示失效并移除按钮。

TUI 使用完整审批身份提交，required/resolved 事件结束交互。版本去重和审批身份隔离避免旧结果关闭新一轮审批；执行阶段单独更新工具状态。TUI 只订阅自己发起 run 的事件，不会接管另一个进程中正在运行的会话。

## 验证

回归测试覆盖 Main 竞争决策、身份/peer/topic 校验、超时、取消、自动审批、重复轮次和终态上限；Renderer 覆盖快照竞态、切换会话、远端批准与执行阶段、计划审批投影；Telegram 覆盖远端决策、send/edit 竞态、网络恢复和旧 callback；TUI 覆盖远端解决审批。

```bash
pnpm exec vitest run src/main/orchestration/chat/run/infrastructure/__tests__/tool-confirmation.test.ts src/main/orchestration/chat/run/__tests__/RunService.shared.test.ts src/main/services/telegram/__tests__/TelegramGatewayService.test.ts src/renderer/src/features/chat/state/__tests__/toolConfirmationStore.test.ts src/renderer/src/features/chat/toolConfirmation/__tests__/useToolConfirmations.test.tsx
pnpm run typecheck
pnpm run check:main-boundaries
pnpm run check:renderer-boundaries
pnpm test:coverage
```

真实验收应在 Telegram 发起同一会话并同时打开 Chat，分别从两端批准/拒绝，验证另一端展示；再检查 Light/Dark、窄宽窗口、reload、超时和取消。隔离 Electron fixture 可验证实际 IPC、审批卡片和工具行，不代表真实 Telegram 网络验收。

决策背景见 [ADR-0026](../decisions/0026-main-owned-tool-confirmation-lifecycle.md)。

本次实现的检查结果与集成验收边界见 [跨 host 工具审批验证记录](../guides/testing/cross-host-tool-confirmation.md)。

## Telegram 投递记录与模型历史

`telegram_send_message` 保存 `source: telegram_delivery` 的展示/投递记录，不把它视为独立的模型 assistant 回合。`isTransportDeliveryMessage` 统一识别新记录，以及旧的无 model/modelRef/toolCalls 的 Telegram outbound assistant 副本。正常 Telegram 用户消息与带模型身份的助手响应继续进入模型历史。

普通请求在工具配对前排除投递记录；压缩策略和摘要输入使用同一规则。桌面保留 Sent to Telegram 展示，数据库记录不删除，也不需要 schema 迁移。该规则修复发送工具在当前 chat 内写入投递副本、打断连续工具结果而使后续请求失败的场景。
