# Chat Top Mode Scroll Fix Summary

## 本轮修复

### user-sent 目标

原实现计算了 `anchorIndex`，执行阶段仍固定滚到末项底部。本轮统一使用精确 user target 与 `align: 'start'`，hint 带 id 时等待该消息进入列表，缺少 id 时选择最后一条 user message。

### 顶部对齐空间

固定 `paddingEnd: 12` 无法支持短尾部内容的顶部对齐。本轮增加两阶段动态 spacer：首帧按可用视口预填充，测量后按 user 锚点到末项的 tail height 收敛。assistant 增长会让 spacer 缩小，user 顶部保持稳定。

### 追加与流式行为

`anchor-lock` 和 `manual` 关闭 `followOnAppend` 并使用 `anchorTo: 'start'`；`tail-follow` 使用 `anchorTo: 'end'`。render 阶段同步结合当前 scroll hint 推导有效模式，确保 `user-sent` 首次 `setOptions()` 已使用顶部锚定策略。item resize 仅补偿视口上方内容。初次实测对齐通过一次性 gate 最多校正一次 `scrollTop`，后续流式更新只收敛 spacer。typing callback 在 `anchor-lock` 只触发布局收敛；`tail-follow` 的 RAF 追尾保险链等待真实流式验证。

### 抖动回归修复

旧实现的持续顶部校正与 virtualizer 尾部 resize 补偿形成反馈回路，并反复刷新 suppression。当前实现按三态选择一致的锚定方向，顶部校正收敛为 one-shot，wheel 与 pointer-active scroll 在 suppression 期间仍派发用户意图。输出完成后用户可立即下滚并进入 `manual`。

### 按钮语义

按钮状态改为用户意图锁存。用户向上滚动和搜索跳转显示按钮；点击按钮后淡出并切回 `tail-follow`；切会话、空列表和 user-sent 清理按钮。`tail-follow` 位于末尾时的向下意图保持追尾状态。

### 公共执行骨架与清理

四类 scroll hint 使用 `runScrollHint()` 统一执行状态更新、spacer 初始化、按钮处理、hint 清理和程序滚动抑制。未使用的 `scrollToLatest` 已从 hook API 删除，overscan 从 `8` 调整为 `4`。

## 当前行为

- 新 user 消息第一行对齐顶部遮挡区下方。
- assistant streaming 在 `anchor-lock` 中向下生长。
- 用户上滚后保持浏览位置，手动滚到底部仍保留按钮。
- 点击按钮平滑滚到最新消息底部，后续内容继续贴底。
- 搜索结果顶部对齐并显示按钮。
- 初次进入与切换会话保持尾部定位语义。

## 验证范围

- `chatScrollPolicy.test.ts`：9 个 spacer、三态 anchorTo、one-shot 校正、锚点与末尾追尾策略测试。
- `useScrollManagerTop.test.tsx`：7 个按钮锁存、wheel、pointer 与 suppression 测试。
- `pnpm run typecheck:web`。
- `git diff --check`。

真实流式环境继续验证 segment 首帧、复杂 Markdown、tool result 和快速长会话滚动，作为 typing RAF 去留与 overscan 最终阈值的依据。
