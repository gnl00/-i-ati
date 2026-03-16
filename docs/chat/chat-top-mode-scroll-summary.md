# Chat Top Mode Scroll Summary

## Background
- 现有聊天窗口在新消息与 stream chunk 到来时频繁“滚到底部”，导致抖动。
- 目标改为顶部展示模式：最新用户消息置顶，stream 仅更新内容不触发滚动。
- 在此基础上，进一步收敛 spacer 行为，避免“无内容空滚动”和滚动语义不一致。

## Requirement Source
- 需求来自对话中的连续交互反馈，核心诉求包括：
  - 发送 `user-latest` 后，该消息应直接显示在 ChatWindow 顶部。
  - assistant streaming 期间不应触发自动滚动，保持当前顶部锚点稳定。
  - 用户上滚意图出现时显示 `scroll to latest message` 按钮。
  - stream 结束后重算底部 spacer，按内容高度和窗口高度收敛布局。
  - `__CHAT_WINDOW_MODE` 默认启用 `top` 模式。

## Design
- 统一为“顶部锚定 + 条件 spacer”的滚动模型：
  - 自动滚动锚点：`latestUserForAutoTop`（避免顶到空 assistant placeholder）。
  - 按钮锚点：`latestMessage`（最后一条）。
  - spacer 用于保证“可把锚点顶到顶部”，但可在特定条件下禁用。
- 滚动职责分层：
  - `useScrollManagerTop` 负责滚动监听、按钮显隐、自动滚动触发。
  - `ChatWindowComponentNext` 负责 spacer 计算、stream 结束收敛、业务条件判定。

## Implementation
- 新增顶部滚动 Hook：
  - `src/renderer/src/hooks/useScrollManagerTop.ts`
  - 仅在消息长度增长时自动滚动；stream chunk 不触发滚动。
  - 合并“用户上滚意图”监听（wheel + scroll），并回调组件处理业务逻辑。
- 新增顶部窗口组件：
  - `src/renderer/src/components/chat/ChatWindowComponentNext.tsx`
  - 使用 `Virtuoso` + `Footer spacer` 实现顶部锚定布局。
  - spacer 计算改为基于 `virtuosoRef.getState().ranges`，避免 `data-index` DOM 查询失效窗口。
  - stream 结束时执行最终收敛：
    - 若 latest assistant 高度 >= chat window 高度：禁用 spacer。
    - 否则：`assistantHeight + spacerHeight = windowHeight`。
  - 在“stream 已结束 + 用户上滚意图 + 视口满足阈值”时禁用 spacer。
- 锚点策略统一函数：
  - `src/renderer/src/components/chat/scroll-anchor.ts`
  - 提供 `resolveAnchorIndex(messages, mode)`，减少多处锚点分叉。
- 首页模式切换：
  - `src/renderer/src/pages/HomeV2.tsx`
  - `__CHAT_WINDOW_MODE` 默认值改为 `top`（仍支持 runtime 切换）。
- 输入区兼容：
  - `src/renderer/src/components/chat/chatInput/ChatInputArea.tsx`
  - `onMessagesUpdate` 改为可选，兼容新旧窗口组件。

## Final Behavior
- 新用户消息发送：自动置顶显示。
- assistant streaming：不自动滚动，只更新消息内容。
- `scroll to latest message` 按钮：
  - 用户上滚出现；
  - 点击滚到最新消息区域；
  - 并触发临时 spacer 禁用逻辑。
- stream 结束：立即重算/收敛 spacer，避免残留空滚动。

## Optimization Notes
- 已完成：
  - 上滚监听合并。
  - spacer 计算节流（rAF 合并 + 值变化才 setState + stream 节流轮询）。
  - 锚点策略集中化。
- 可继续（非阻断）：
  - 按钮点击逻辑与 typewriter 状态更新进一步解耦（纯滚动职责）。
  - 增补滚动回归测试（发送置顶、stream 稳定、结束收敛）。
