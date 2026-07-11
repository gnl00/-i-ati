# Chat Top Mode Scroll Summary

## 当前合同

ChatWindow 使用 `tail-follow`、`anchor-lock`、`manual` 三态滚动模型。新 user 消息建立顶部锚点；assistant 流式内容向下生长；用户浏览历史时保持当前视口；点击“跳回最新消息”后贴底并恢复尾部跟随。

## 职责边界

- `ChatWindow` 负责 scroll hint 策略、三态切换、动态 `paddingEnd`、一次性锚点校正、typewriter 完成和跳回最新行为。
- `useScrollManagerTop` 负责 wheel/pointer 用户意图识别、程序滚动抑制和按钮事件锁存。
- `scroll-anchor` 负责 user-sent 锚点解析、spacer 计算、首帧模式推导与末尾追尾策略，便于 focused tests 覆盖边界条件。
- 定制 TanStack Virtual fork 继续承担动态测量、末尾判断和 item resize 补偿。

## Scroll Hint 策略

| Hint | 目标 | 对齐 | 模式 | 按钮 |
| --- | --- | --- | --- | --- |
| initial mount | 最后一项 | `end` | `tail-follow` | 隐藏 |
| conversation-switch | hint index | hint align | `tail-follow` | 隐藏 |
| user-sent | 精确 user message | `start` | `anchor-lock` | 隐藏 |
| search-result | 精确 message | `start` | `manual` | 显示 |

四类 hint 通过 `runScrollHint()` 共用状态更新、hint 清理、意图抑制和 RAF 滚动骨架，各 effect 保留自己的目标解析条件。

## 虚拟列表参数

- `paddingStart` 与 `scrollPaddingStart` 使用顶部遮挡高度。
- `paddingEnd` 使用动态 spacer，基础值为 `12px`。
- `followOnAppend` 只在 `tail-follow` 开启。
- `anchorTo` 在 `tail-follow` 使用 `end`，在 `anchor-lock` 与 `manual` 使用 `start`。
- 有效模式在 render 阶段结合当前 scroll hint 同步推导，确保 virtualizer 当次 `setOptions()` 获得最新追加策略。
- `anchor-lock` 的初始实测校正最多写入一次 `scrollTop`；后续 resize 只更新 spacer。
- `tail-follow` 已处于末尾时，向下用户意图继续保持追尾；向上意图进入 `manual` 并锁存按钮。
- overscan 当前为 `4`，真实长会话出现空白帧时回调到 `5` 或 `6`。
- virtual item 使用稳定 message key，并通过 `measureElement` 回填真实高度。

## 验证

自动化覆盖 user 锚点解析、pending assistant、spacer 收缩、三态 `anchorTo`、one-shot 校正与 viewport/overlay 变化，以及按钮显式锁存、切会话清理和 suppression 期间的真实 wheel/pointer 输入。

真实流式验收仍需覆盖纯文本、代码块、reasoning、tool result 与 segment 首帧。完成该验收后再评估 `tail-follow` typing RAF 保险链。
