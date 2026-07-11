# Chat Top Anchor Lock Current Design

## 目标行为

- 用户发送消息后，该 user message 第一行对齐聊天视口顶部。
- assistant 流式输出期间保持 user 锚点，内容向下生长。
- 用户产生有效浏览意图后进入手动浏览；向上滚动时显示“跳回最新消息”。
- 点击按钮后贴到最新消息底部，并恢复尾部跟随。
- 切换会话与搜索跳转保留原有目标语义。

## 三态模型

- `tail-follow`：初次进入、切换会话和点击跳回最新后的尾部跟随状态。
- `anchor-lock`：`user-sent` 建立的本轮 user 顶部锚点。追加跟随关闭，assistant resize 只触发 spacer 收敛。
- `manual`：用户显式滚动或搜索跳转后的浏览状态。手动滚到底部仍保持该状态，按钮承担显式恢复入口。

## 锚点与动态尾部填充

`user-sent` 优先通过 hint 的 `messageId` 定位 user message；hint 未携带 id 时回退到当前列表最后一条 user message。pending assistant 不参与锚点选择。

首帧先把 `paddingEnd` 预填充到可用视口高度，确保 `align: 'start'` 拥有足够滚动空间。完成虚拟项测量后按下式收敛：

```text
tailHeight = latestItem.end - anchorItem.start
availableViewportHeight = viewportHeight - topOcclusionPx
paddingEnd = max(basePaddingEnd, ceil(availableViewportHeight - tailHeight))
```

assistant 增长时 `tailHeight` 增加，spacer 单调收缩到基础值 `12px`。容器 resize、顶部计划栏高度变化和 virtual item 测量更新都会复用同一计算。

## 追加与 resize 策略

- `followOnAppend` 只在 `tail-follow` 开启。
- render 阶段会结合当前会话的 scroll hint 同步推导有效模式，`user-sent` 首帧即关闭 `followOnAppend`，`search-result` 和 `conversation-switch` 同步进入各自模式。
- virtualizer 的 `anchorTo` 随有效模式切换：`tail-follow` 使用 `end`，`anchor-lock` 与 `manual` 使用 `start`。
- `tail-follow` 且位于末尾阈值时，item resize 继续保持底部锚定。
- `anchor-lock` 与 `manual` 只补偿完全位于视口顶部之前的 item。
- 初次 `scrollToIndex(..., { align: 'start' })` 完成后武装一次性校正。spacer 实测值稳定后，锚点 DOM 与预期顶部偏差超过 `1px` 时校正一次 `scrollTop`，随后消费校正 gate。
- 后续 layout 与流式 resize 只更新 spacer，滚动位置交由 start anchor 和用户输入管理。

## 退出与恢复

wheel 和 pointer-active scroll 代表明确用户意图，即使处于程序滚动 suppression 窗口也会派发。`anchor-lock` 收到这些意图后进入 `manual`。`tail-follow` 已处于末尾时，向下 wheel 或 pointer 意图继续保持追尾；向上意图进入 `manual` 并锁存按钮。普通 scroll 事件可能来自虚拟列表测量、spacer 更新或程序滚动，suppression 只过滤这类缺少用户输入来源的事件。

退出锚定时保留当下 spacer 高度，避免缩短滚动范围造成视口跳动；`manual` 期间停止 spacer 自动收敛。点击跳回最新、新 user-sent 或切换会话时再重置或重建 spacer。

“跳回最新消息”按钮由事件锁存：用户向上滚动或搜索跳转时显示；点击按钮、切换会话、空列表和新的 user-sent 时隐藏。用户意图事件与显式按钮操作完整管理模式转换。

## 流式追尾保险链

`anchor-lock` 下的 `handleLatestAssistantTyping()` 只请求锚点布局收敛。`tail-follow` 下暂时保留 `scrollToEnd()` RAF 保险链，用于覆盖 segment 首帧与复杂 Markdown 测量时序。该链路等待真实流式验收后再决定去留。

## 相关文件

- `src/renderer/src/components/chat/ChatWindowComponentNext.tsx`
- `src/renderer/src/components/chat/scroll-anchor.ts`
- `src/renderer/src/hooks/useScrollManagerTop.ts`
- `src/renderer/src/components/chat/__tests__/chatScrollPolicy.test.ts`
- `src/renderer/src/hooks/__tests__/useScrollManagerTop.test.tsx`
