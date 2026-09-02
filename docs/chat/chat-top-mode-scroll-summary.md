# Chat MessageScroller 滚动摘要

## 当前合同

Chat transcript 由 `ChatTranscriptScroller` 和 MessageScroller provider 维护。新 user
消息通过 `scrollAnchor` 建立阅读起点；assistant 流式内容由 provider 追踪；用户浏览
历史时保持当前视口；点击 `MessageScrollerButton` 后回到最新位置并恢复 following。

## 职责边界

- `ChatTranscriptScroller` 负责 scroll hint 目标解析、provider 参数、稳定 row identity、顶部遮挡与搜索校正。
- MessageScroller provider 负责 following、anchor、manual 浏览、prepend 保持、动态测量与 item resize 补偿。
- `ChatWindow` 保留计划栏高度测量、welcome、side panel 与输入区布局。

## Scroll Hint 策略

| Hint | 目标 | 对齐 | 实现 |
| --- | --- | --- | --- |
| initial mount | 最新消息 | `end` | provider `defaultScrollPosition="end"` |
| conversation-switch | hint index | hint align | `scrollToMessage` |
| user-sent | 精确 user message | `start` | user item `scrollAnchor` |
| search-result | 精确 message | `start` | `scrollToMessage` + 下一帧布局校正 |

hint 在 `ChatTranscriptScroller` 内单次消费，provider 负责具体滚动与用户意图状态。

## MessageScroller 参数

- provider 使用 `autoScroll`、`defaultScrollPosition="end"`、`scrollEdgeThreshold=80` 和 `scrollPreviousItemPeek=24`。
- provider `scrollMargin` 使用计划栏/头部的实时遮挡高度，并以 chat UUID 隔离状态。
- viewport 默认保持 prepend 前的阅读位置；item 使用稳定字符串 `messageId`。
- 当前 user、当前 assistant、pending assistant 与搜索目标使用真实布局尺寸；历史 item 使用 `content-visibility`。
- `MessageScrollerButton` 读取 provider 的 end 状态，管理自身可见性和跳回最新操作。

## 上游补丁

`@shadcn/react@0.3.0` 的本地 pnpm patch 在首次内容挂载时登记已有 anchor，避免等量
row 替换把历史 user item 识别为新增 anchor。补丁对应 shadcn/ui issue #11128，依赖升级
时需重新检查并删除已经进入上游版本的修复。

## 验证

聚焦测试覆盖 provider 参数、消息 identity、user anchor、pending-to-committed assistant key、
搜索 hint 单次消费与无头像 Message 行。真实 Electron 验收继续覆盖流式增长、手动浏览、
长历史搜索、嵌套滚动、Light/Dark Mode 与跨会话切换。
