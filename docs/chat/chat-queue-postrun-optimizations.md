# Chat Queue 与 Post-run 优化说明

## 背景

这次优化围绕 chat submit 后的排队体验和 post-run 维护任务展开，主要解决两个问题：

1. Assistant streaming 已结束后，用户消息仍因为 title/compression post-run 任务被排队。
2. 用户连续输入多条 queued 消息时，系统逐条发起 run，造成上下文割裂、额外 title/compression 任务和不必要请求。

## 优化一：Post-run 阻塞策略与标题生成保护

### 原问题

输入框曾用 `runPhase !== 'idle'` 判断是否排队。这样 `post_run` 阶段也会阻塞 submit。

`post_run` 包含两类任务：

- title generation：只影响 chat list 展示。
- compression：会影响下一轮请求构建时使用的压缩摘要。

这两类任务对下一条用户消息的影响不同。compression 正在执行时，新消息必须等待，否则下一轮 run 可能读取不到刚生成的压缩摘要。title generation 只影响标题展示，可以放行。

### 新规则

提交阻塞条件集中在 `src/renderer/src/features/chat/input/queuePolicy.ts`：

```ts
runPhase === 'submitting'
  || runPhase === 'streaming'
  || runPhase === 'cancelling'
  || postRunJobs.compression === 'pending'
```

含义：

- `submitting`、`streaming`、`cancelling`：主 run 仍占用提交通道。
- `compression pending`：下一轮上下文依赖压缩结果，继续排队。
- `title pending`：放行提交。

### Run lifecycle 调整

`src/renderer/src/features/chat/runtime/useChatRun.ts` 只把 compression 视为 blocking post-run job。

当 run 完成且只有 title pending 时：

- 释放 active submission lock。
- 使用轻量后台订阅继续接收 title 的 `CHAT_UPDATED` 和终态事件。
- 允许下一条用户消息立即提交。

当 compression pending 时：

- 保持 `post_run` 状态。
- 队列继续等待 compression 完成。

### 标题生成竞态保护

连续快速提交新 chat 的短消息时，可能出现多个 title job 并发：

```text
yo   -> title job A
yo?  -> title job B
sha? -> title job C
```

旧逻辑中，三个 job 都拿到 `NewChat`，最后完成的 job 会覆盖标题。例如最终变成 `SHA相关问题`。

`src/main/orchestration/chat/postRun/TitleJobService.ts` 现在做两次 reload 保护：

1. title 请求前 reload chat，如果标题已经不是默认标题，跳过生成。
2. title 生成后、写入前再次 reload chat，如果期间已有标题写入，跳过覆盖。

`src/main/hosts/chat/persistence/ChatSessionStore.ts` 的 finalize 写回也会先 reload chat，并保留数据库中的最新标题，避免重叠 run 使用旧的 `NewChat` 快照覆盖已生成标题。

`src/main/hosts/chat/persistence/ChatStepStore.ts` 的 message attach 写回同样基于最新 chat row，追加 message id 时会保留最新标题并避免重复 id。这个保护覆盖 user message 创建和 assistant message 持久化阶段的 chat row 更新。

默认标题判断封装为：

```ts
function isDefaultChatTitle(title?: string): boolean {
  return !title || title === 'NewChat'
}
```

这样最先成功写入的标题会被保留，后完成的并发 title job 不会覆盖。

## 优化二：Queued 消息 Flush 时合并

### 原问题

用户在 run 忙碌期间连续输入：

```text
yo
yo?
sha?
```

旧逻辑会在上一轮完成后逐条 flush：

```text
run 1: yo
run 2: yo?
run 3: sha?
```

这会带来几个问题：

- 多次请求和多次 post-run plan。
- 多次 title generation。
- 用户本意是连续补充，模型却看到多个独立回合。

### 新规则

队列 UI 仍保留原始条目，便于展示第一条和 `+N`，也保留 Shift+Up 编辑队首消息的行为。

真正 flush 时，当前队列会合并成一条 payload：

```text
yo
yo?
sha?
```

任务补充类消息也会按顺序合并：

```text
帮我完成xxx，需要xxx
这里需要补充一下xxx
还有这里xxx
```

### 合并规则

实现位置：`src/renderer/src/features/chat/input/queuePolicy.ts`

```ts
export function mergeQueuedMessages(items: QueuedChatMessage[]): QueuedChatMessage | null
```

规则：

- `text`：每条消息 `trim()` 后按原顺序用 `\n` 连接。
- `images`：按原顺序 concat。
- `userInstruction`：使用第一条 queued message 的值。
- 空队列返回 `null`。

接入位置：`src/renderer/src/features/chat/input/ChatInputArea.tsx`

queue flush 从取队首：

```ts
const [nextItem, ...rest] = prev
submitMessage(nextItem)
return rest
```

改为合并并一次性清空：

```ts
const nextItem = mergeQueuedMessages(prev)
submitMessage(nextItem)
return []
```

## 行为示例

### Title-only post-run

```text
assistant 完成回答
title generation pending
用户发送下一条消息
```

结果：下一条消息立即提交。

### Compression post-run

```text
assistant 完成回答
compression pending
用户发送下一条消息
```

结果：下一条消息进入 queue，等待 compression 完成后提交。

### 多条 queued 消息

```text
queue:
1. yo
2. yo?
3. sha?
```

flush 后提交一次：

```text
yo
yo?
sha?
```

## 关键文件

- `src/renderer/src/features/chat/input/queuePolicy.ts`
- `src/renderer/src/features/chat/input/ChatInputArea.tsx`
- `src/renderer/src/features/chat/runtime/useChatRun.ts`
- `src/renderer/src/features/chat/runtime/chatRunEvent.ts`
- `src/main/orchestration/chat/postRun/TitleJobService.ts`
- `src/main/hosts/chat/persistence/ChatSessionStore.ts`
- `src/main/hosts/chat/persistence/ChatStepStore.ts`

## 测试覆盖

- `src/renderer/src/features/chat/input/__tests__/queuePolicy.test.ts`
- `src/renderer/src/features/chat/runtime/__tests__/chatRunEvent.test.ts`
- `src/main/orchestration/chat/postRun/__tests__/TitleJobService.test.ts`
- `src/main/hosts/chat/__tests__/ChatSessionStore.test.ts`
- `src/main/hosts/chat/persistence/__tests__/ChatStepStore.test.ts`

验证命令：

```bash
pnpm exec vitest run \
  src/renderer/src/features/chat/input/__tests__/queuePolicy.test.ts \
  src/renderer/src/features/chat/runtime/__tests__/chatRunEvent.test.ts \
  src/main/orchestration/chat/postRun/__tests__/TitleJobService.test.ts \
  src/main/hosts/chat/__tests__/ChatSessionStore.test.ts \
  src/main/hosts/chat/persistence/__tests__/ChatStepStore.test.ts

pnpm run typecheck:node
pnpm run typecheck:web
```
