# Chat Top Mode Scroll Fix Summary

## 背景

本轮修复的目标是让 `top mode` 聊天窗口满足以下体验：

- 消息顺序保持正常时间序，旧消息在上，新消息在下。
- 发送最新 user 消息后，这条 `user-latest` 必须立即出现在可视区顶端。
- assistant streaming 期间只更新消息内容，不应把视图重新推到底部，也不应让顶端锚点漂移。
- footer padding spacer 应随文本高度变化动态收缩，而不是在错误时机残留或抖动。

## 关键问题

### 1. 自动置顶锚点语义错误

最初 `latestUserForAutoTop` 只在 latest assistant 还是空 placeholder 时才返回上一条 user。  
一旦 assistant 开始输出文本，锚点就切换成 latest assistant，导致 top line 从 `user-latest` 漂到 `assistant-latest`。

### 2. spacer 计算目标错误

早期 spacer 只参考“最后一条消息高度”，没有以“当前轮 user 锚点到尾部总高度”作为计算基准。  
这会让 top-mode 语义错位，尤其在 assistant/toolcall 出现后更明显。

### 3. streaming 期间把所有高度变化都当成 spacer 更新信号

toolcall / reasoning / status 变化与 text segment 增长共用同一条 assistant message。  
如果 streaming 期间对所有高度变化都重算 spacer，就会引入不必要的抖动。

### 4. toolcall 高度变化导致 top line 漂移

即使 spacer 不变，`react-virtuoso` 在 item 动态高度变化时仍会修正 scroll offset。  
如果 latest assistant 在 streaming 中插入 toolcall 卡片或状态变化，`user-latest` 可能被慢慢顶出顶部。

### 5. chat 切换时旧 spacer 残留

从 ChatSheet 点击切换到另一个 chat 时，虽然 `messages` 已切换，但旧的 spacer 高度和挂起的 rAF 可能仍残留一帧，导致新 chat 初始 footer spacer 不为 0。

## 修复方案

### 1. 固定自动置顶锚点到“当前轮最近 user”

`latestUserForAutoTop` 现在始终从尾部向前查找最近一条 `user`。  
因此 assistant 开始输出后，top line 仍然保持为 `user-latest`。

### 2. spacer 改为基于“锚点到尾部”的 tail height 计算

footer spacer 不再只看最后一条消息，而是计算：

- `anchor = latestUserForAutoTop`
- `tailHeight = latestMessage.bottom - anchor.top`

然后用 `viewportHeight - tailHeight` 计算 footer spacer。

### 3. 仅在 text segment / typewriter 推进时动态更新 spacer

spacer 现在主要由以下事件触发重算：

- 新消息插入
- text segment 内容增长
- typewriter 推进
- 容器 resize
- stream 结束后的正常收敛测量

toolcall / reasoning / error 等非文本变化不再直接驱动 spacer 更新。

### 4. 使用 Virtuoso 的总高度变化回调做 top-anchor lock

给 `Virtuoso` 接入 `totalListHeightChanged`。  
当 latest assistant 因 toolcall 或动态内容导致总高度变化时，重新把 `latestUserForAutoTop` 滚到 `start`，保证 top line 稳定。

### 5. 减少 toolcall 渲染对虚拟列表测量的干扰

`ToolCallResult` 去掉了外层纵向 `margin`，改为内部 `padding`，减少动态高度列表测量误差。

### 6. chat 切换时重置滚动状态

在 `chatUuid` 变化时，显式重置：

- `bottomSpacerHeight = 0`
- `disableTailSpacer = false`
- spacer 相关 refs
- 挂起的 spacer / top-lock rAF

这样新 chat 首帧的 padding spacer 初始值就是 0。

## 当前行为

- 发送 `user-latest` 后，该消息会立即贴到 ChatWindow 顶部。
- assistant 开始输出文本后，top line 仍保持为 `user-latest`。
- toolcall 在 streaming 中插入、执行、完成时，top line 目前表现稳定。
- footer spacer 会随 text segment 增长动态缩小；内容足够高时自然收敛到 0。
- 从 ChatSheet 切换到新的 chat 时，footer spacer 初始值为 0。

## 相关文件

- `src/renderer/src/components/chat/ChatWindowComponentNext.tsx`
- `src/renderer/src/hooks/useScrollManagerTop.ts`
- `src/renderer/src/components/chat/scroll-anchor.ts`
- `src/renderer/src/components/chat/chatMessage/toolcall/ToolCallResult.tsx`
