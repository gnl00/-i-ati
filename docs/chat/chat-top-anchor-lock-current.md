# Chat 顶部锚定当前设计

## 目标行为

- 用户发送消息后，user row 对齐顶部遮挡区域下方。
- assistant 流式输出保留本轮阅读上下文，并在 live edge following 状态下持续追尾。
- 用户滚动进入历史阅读状态，后续内容增长保持当前视口。
- 跳回最新按钮贴到 transcript 末端并恢复 following。
- 会话切换与搜索跳转保留各自目标语义。

## MessageScroller 模型

每个 user item 设置 `scrollAnchor=true`。Provider 使用 `scrollPreviousItemPeek=24` 保留少量
上一轮上下文，使用动态 `scrollMargin` 避开 ChatHeader 与计划栏。MessageScroller 内部 tail
spacer 为短回复提供向下生长空间，ResizeObserver 在内容高度变化时重算布局。

Content 使用同一个动态遮挡值作为 `padding-block-start`，为滚动位置 0 的第一条消息保留
实际空间。`scrollMargin` 继续负责锚点、搜索结果与显式定位时的顶部对齐。

Transcript 在创建 item 前只保留可渲染的 user 与 assistant 消息。独立 tool 记录继续作为
模型上下文保存，不进入 flex 列表，也不会产生空 item 间距。

Provider 以 `chatUuid` 作为 React key，不同会话拥有独立滚动状态。初次挂载使用
`defaultScrollPosition="end"`；用户发送由新增 anchor 驱动；搜索与显式会话定位通过
`scrollToMessage()` 执行。

## 用户意图与恢复

Viewport 把 wheel、touch 与滚动键盘输入交给 provider。离开 live edge 后，
`MessageScrollerButton` 根据 end 状态显示；按钮调用 `scrollToEnd()` 并恢复 following。
按钮点击同时完成当前静态 assistant 的 typewriter 内容，延续已有快速展开语义。

## 内容可见性与搜索

历史 item 使用 `content-visibility:auto` 和 intrinsic size 降低长 transcript 的渲染成本。
当前 user、当前 assistant、pending assistant 与显式搜索目标切换为 `content-visibility:visible`。
搜索先调用 `scrollToMessage()`，下一帧再用目标元素的真实尺寸执行 `scrollIntoView()` 校正。

## 相关文件

- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
- `src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx`
- `src/renderer/src/shared/components/ui/message-scroller.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatWindow.message-scroller.test.tsx`
