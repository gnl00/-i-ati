# Title Generation — Title Agent

> **状态**: 运行中参考档（持续同步） · **最后更新**: 2026-06-06

本文记录 Title Agent 当前实现事实：`TitleJobService.run()` 已改为 `agent()` 抽象路径。

---

## 1. 当前实现

`TitleJobService` 不再直接调用 `TitleGenerationService.generateTitle()`。`run()` 现在以以下方式执行：

1. 由 `shouldRun()` 判断 `titleGenerateEnabled` 与 `title === 'NewChat'`。
2. 解析 title 专用模型/账号上下文。
3. 调用

```ts
agent(
  'title-generator',
  buildTitleAgentSystemPrompt(latestChat.uuid),
  ['chat_set_title'],
  buildTitleAgentMessages(args),
  false,
  {
    model,
    account,
    providerDefinition,
    sanitizeOverrides: providerOverrides => resolveRequestOverrides(providerOverrides, 'title'),
    requestOptions: { thinking: { enabled: false } }
  }
)
```

关键行为：

- `loop` 固定为 `false`，模型调用后若出现 tool call 直接返回。
- `sanitizeOverrides` 走 `resolveRequestOverrides(..., 'title')`。
- `requestOptions.thinking.enabled=false` 与 `resolveRequestOverrides` 共同移除不兼容字段。

### 1.1 Title 输入构造

`buildTitleAgentMessages(args)` 产出逻辑为：

- 从 `messageBuffer` 中筛选可见 `user/assistant` 消息。
- 取最近 **2** 条作为上下文。
- 过滤结果为空时回退到 `args.content`。

该约束使得模型可基于最近上下文决策，且不依赖完整长上下文。

### 1.2 提示词语义

`src/shared/prompts/title-agent.ts` 的主语义为：

- 使用 `chat_set_title` 工具最多调用一次。
- 一条清晰消息足以生成标题。
- 主题不清晰时返回 `NEED_MORE_CONTEXT`。
- 工具参数包含 `title` 与 `chat_uuid`。

---

## 2. `chat_set_title` 工具与上下文

工具定义位于 `src/shared/tools/title/definitions.ts`，核心约束：

- 工具名：`chat_set_title`
- 必填参数：`title`、`chat_uuid`
- 处理链在 `src/main/tools/title/TitleToolsProcessor.ts` 中落库更新会话标题。

`agent()` 会把工具解析为 `embeddedToolsRegistry.getTools(['chat_set_title'])`，并通过 `embeddedToolsRegistry.getHandler` 执行。

---

## 3. 兼容字段与请求控制

Title 场景通过 `resolveRequestOverrides(providerOverrides, 'title')` 做集中化兼容，当前规则移除：

- `thinking`
- `reasoning`
- `reasoning_effort`
- `tool_choice`
- `output_config.effort`

`agent()` 入口仍将 provider 的 payload extension 与 overrides 注入 request，但由以上策略消除 title 场景不兼容字段。

---

## 4. 处理分支

### 4.1 `type === 'tool_call'`

- `chat_set_title` 成功执行。
- 标题通过 `chat_set_title` handler 更新 DB。
- `TitleJobService` 重新读取会话，若 title 变更则 `emitChatUpdated`。

### 4.2 `type === 'text'`

- 通常对应模型未调用工具，包含 `NEED_MORE_CONTEXT`。
- `TitleJobService` 不改写标题。
- 任务以 `TITLE_GENERATION_COMPLETED` 收口，后续 post-run 轮次可能再次尝试。

### 4.3 `type === 'error'`

- 记录失败日志。
- 触发失败事件，便于观察。

---

## 5. 与 `TitleGenerationService` 的关系

- 当前 `TitleJobService` 走 `agent()` 单一路径，不再走 `generateTitle()` 作为降级。
- `shouldRun` 的 title 再次触发条件保持不变，依赖会话标题是否为 `NewChat`。
- 主 agent 自主调用 `chat_set_title` 仍可更新标题。

---

## 6. 已完成项

- [x] `src/main/orchestration/chat/postRun/TitleJobService.ts`：`run()` 使用 `agent('title-generator', ...)`。
- [x] `src/shared/prompts/title-agent.ts`：Title Agent 专用系统提示词。
- [x] `src/shared/tools/title/definitions.ts`：`chat_set_title`、`chat_uuid` 入参。
- [x] `src/main/tools/title/TitleToolsProcessor.ts`：持久化更新。
- [x] `src/main/request/overrides.ts`：`resolveRequestOverrides(..., 'title')`。

---

## 7. 待确认/待执行

- `src/main/orchestration/chat/postRun/__tests__/TitleJobService.test.ts` 继续补齐 `NEED_MORE_CONTEXT`/`tool_call`/`text`/`error` 覆盖。
