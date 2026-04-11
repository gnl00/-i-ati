# Chat Top Anchor Lock Current Design

## Goal

当前聊天窗口的滚动目标是：

- 用户发送消息后，最新 user message 立即滚到视口顶部。
- assistant streaming 期间，顶部锚点保持稳定，不因为列表测量或内容增长发生漂移。
- 底部 spacer 只承担“补足尾部高度，让 user message 能顶到顶部”的职责。
- 用户明确滚动后，自动退出锚点锁定，恢复手动滚动语义。

## Core Model

当前实现采用三态滚动模型：

- `tail-follow`
  - 正常跟随尾部，适用于切会话和 jump to latest。
- `anchor-lock`
  - 锁定当前轮最新 user message。
  - assistant 更新时只允许两类动作：重算 spacer、补偿 anchor。
- `manual`
  - 用户显式滚动后进入。
  - 不再自动维持顶部锚点。

顶部锚点固定为 `latestUserForAutoTop`，不会在 assistant 开始输出后切到 assistant 自身。

## Layout Structure

`PlanBar` 已移出消息滚动容器。当前结构是：

- 会话级 UI 放在 scroll container 外部
- `Virtuoso` 只负责 transcript
- 底部空白通过 `Virtuoso components.Footer` 注入

这样可以避免列表外 UI 的高度变化污染 transcript 的几何关系。

## Spacer Rule

`bottomSpacerHeight` 的计算基于：

- `anchorTop`
- `latestBottom`
- `tailHeight = latestBottom - anchorTop`
- `requiredViewportFill = viewportHeight - tailHeight`

最终：

- `nextBottomSpacerHeight = max(0, floor(requiredViewportFill))`

含义是：如果“锚点到尾部”的内容高度还不足以撑满视口，就用 Footer spacer 把剩余空间补满；如果已经足够高，spacer 自然收敛到 `0`。

## User-Sent Flow

用户发送消息时执行两阶段：

1. 进入 `anchor-lock`
2. 记录 `lockedAnchorMessageId`
3. 先写入一个初始 spacer，确保列表有足够滚动空间
4. 调用 `scrollToMessageIndex(anchorIndex, false, 'start')`
5. 下一帧进入 layout pass，用真实几何继续收敛 spacer

这里的关键点是：

- “首帧滚到顶部”与“后续布局收敛”分开处理
- 锚点消息优先通过 `messageId` 锁定，而不是只靠 index 推断

## Assistant Update Flow

assistant 更新时，不再改变滚动模式，只触发 layout pass。

layout pass 的职责只有两件事：

1. 计算新的 spacer
2. 检查锚点元素相对容器顶部的偏差，并立即补偿 `scrollTop`

当前实现已经避免了旧问题：

- 过去 spacer 更新后会直接 `return`
- 结果是这一帧先改 spacer，下一帧才补偿 anchor
- 用户会看到顶部“闪一下”

现在 spacer 更新和 anchor 补偿在同一轮 layout pass 内完成，因此 assistant 首次输出时的可见跳动显著降低。

## Stable And Unstable Reasons

当前只允许以下 reason 直接收缩 spacer：

- `user-sent`
- `conversation-switch`
- `container-mounted`
- `container-resize`
- `total-list-height-changed`

`typing-change` 和普通 `transcript-change` 默认不主动触发 spacer shrink。这样可以避免 streaming 中由于瞬时文本状态变化导致 spacer 频繁抖动。

## Exit Conditions

`anchor-lock` 不会因为普通 `scroll` 事件退出。

当前只接受明确用户输入：

- `wheel`
- `pointer`

其中：

- `wheel` 覆盖鼠标滚轮
- `pointer` 主要覆盖拖动滚动条

单纯的 `scrollTop` 变化不再被当成用户意图，因为它也可能来自：

- Virtuoso 动态测量
- spacer 变化
- anchor 补偿
- assistant 内容增长

这是本轮修复里最关键的结构调整之一。

## Conversation Switch

切换会话时：

- 清空锁定锚点
- 重置 spacer
- 切回 `tail-follow`
- 通过显式 scroll hint 定位目标 index
- `Virtuoso` 使用 `key={chatUuid}` 强制 remount，避免复用旧会话测量缓存

## Relevant Files

- `src/renderer/src/components/chat/ChatWindowComponentNext.tsx`
- `src/renderer/src/hooks/useScrollManagerTop.ts`
- `src/renderer/src/components/chat/scroll-anchor.ts`

## Invariants

后续如果继续优化，这几条建议保持不变：

- 顶部锚点始终锁 user message，而不是 latest assistant
- transcript 外 UI 不进入 Virtuoso scroll geometry
- spacer 只表示“尾部补高”，不承载其它布局语义
- 退出 `anchor-lock` 必须来自明确用户输入，而不是普通 `scroll`
- spacer 更新与 anchor 补偿应尽量在同一轮完成
